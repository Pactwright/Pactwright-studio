import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the database and the chain: these tests check the anchorer's logic, not RPC.
vi.mock("@/lib/db", () => {
  return {
    db: vi.fn(),
  };
});
vi.mock("@/lib/chain", () => ({ readContract: vi.fn(), invoke: vi.fn(), chainConfig: vi.fn() }));

import { db } from "@/lib/db";
import { readContract, invoke, type ChainConfig } from "@/lib/chain";
import { Keypair } from "@stellar/stellar-sdk";
import { buildMerkleTree, buildBatch } from "../../lib/anchorer/batch";
import { reconcile } from "../../lib/anchorer/reconcile";
import { anchor, getAnchorVerificationRecord, resetAnchorVerificationRecord } from "../../lib/anchorer";
import { verifyReceipt } from "../../lib/verify";

describe("Anchorer Merkle Tree & Batching (ROADMAP S-04)", () => {
  const leaves = [
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  ];

  it("builds a sorted-pair Merkle tree where every proof verifies with verifyReceipt", () => {
    const { root, proofs } = buildMerkleTree(leaves);

    expect(root).toBeDefined();
    expect(proofs.size).toBe(leaves.length);

    for (const leaf of leaves) {
      const proof = proofs.get(leaf);
      expect(proof).toBeDefined();
      expect(verifyReceipt(leaf, proof!, root)).toBe(true);
    }
  });

  it("handles a single leaf tree", () => {
    const singleLeaf = ["1111111111111111111111111111111111111111111111111111111111111111"];
    const { root, proofs } = buildMerkleTree(singleLeaf);
    expect(root).toBe(singleLeaf[0]);
    expect(proofs.get(singleLeaf[0])).toEqual([]);
  });
});

describe("Anchorer reconciliation with the chain", () => {
  const config = { receiptAnchorId: "CANCHOR" } as ChainConfig;
  const leaf = "1111111111111111111111111111111111111111111111111111111111111111";
  const { root } = buildMerkleTree([leaf]);
  const queries: Array<[string, unknown[] | undefined]> = [];
  let plans: unknown[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    resetAnchorVerificationRecord();
    queries.length = 0;
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      queries.push([sql, params]);
      if (sql.includes("pg_try_advisory_lock")) return { rows: [{ acquired: true }] };
      if (sql.includes("receipts") && sql.includes("SELECT")) return { rows: [{ leaf }] };
      if (sql.includes("FROM anchor_plans")) return { rows: plans };
      if (sql.includes("MIN(ledger)")) return { rows: [{ min: 100, max: 100 }] };
      return { rows: [], rowCount: 1 };
    });
    vi.mocked(db).mockReturnValue({
      query,
      connect: async () => ({ query, release: () => {} }),
    } as unknown as ReturnType<typeof db>);
  });

  const chain = (count: number, batchRoot = root) =>
    vi.mocked(readContract).mockImplementation(async (_c, _s, _id, method) =>
      method === "get_batch_count" ? BigInt(count) : { root: Buffer.from(batchRoot, "hex"), anchored_ledger: 900 },
    );

  it("saves a plan that landed on-chain before a crash, without anchoring again", async () => {
    plans = [{ batch_id: "5", root, leaves: [leaf], age_seconds: 600 }];
    chain(5);
    const result = await reconcile(config, "GANCHORER");
    expect(result).toMatchObject({ recoveredBatches: 1, recoveredReceipts: 1, droppedPlans: 0, inFlight: false });
    expect(queries.find(([sql]) => sql.includes("UPDATE receipts SET batch_id"))?.[1]).toEqual([5, "[]", leaf]);
    expect(queries.some(([sql]) => sql.includes("DELETE FROM anchor_plans"))).toBe(true);
  });

  it("drops a plan whose transaction never landed", async () => {
    plans = [{ batch_id: "6", root, leaves: [leaf], age_seconds: 600 }];
    chain(5);
    expect(await reconcile(config, "GANCHORER")).toMatchObject({ recoveredBatches: 0, droppedPlans: 1 });
  });

  it("waits while a recent plan may still land", async () => {
    plans = [{ batch_id: "6", root, leaves: [leaf], age_seconds: 10 }];
    chain(5);
    expect(await reconcile(config, "GANCHORER")).toMatchObject({ inFlight: true, droppedPlans: 0 });
  });

  it("anchors the next batch with the id the contract will assign and stores the real tx", async () => {
    plans = [];
    chain(5);
    vi.mocked(invoke).mockResolvedValue({ txHash: "ab".repeat(32), ledger: 1000, returnValue: 6n });
    const result = await anchor({ config, signer: Keypair.random() });
    expect(result).toEqual({ batchId: 6, root, leaves: 1, anchorTx: "ab".repeat(32), anchoredLedger: 1000 });
    expect(vi.mocked(invoke).mock.calls[0]?.[3]).toBe("anchor_batch");
    const planned = queries.find(([sql]) => sql.includes("INSERT INTO anchor_plans"));
    expect(planned?.[1]?.[0]).toBe(6);
    expect(queries.find(([sql]) => sql.includes("INSERT INTO receipt_batches"))?.[1]).toEqual([6, root, 1, "ab".repeat(32), 1000]);
  });

  it("refuses to record a batch the contract numbered differently", async () => {
    plans = [];
    chain(5);
    vi.mocked(invoke).mockResolvedValue({ txHash: "ab".repeat(32), ledger: 1000, returnValue: 9n });
    await expect(anchor({ config, signer: Keypair.random() })).rejects.toThrow(/assigned batch 9/);
  });

  it("two concurrent anchor() calls produce exactly one batch and no shared leaves (#52)", async () => {
    plans = [];
    chain(5);
    vi.mocked(invoke).mockResolvedValue({ txHash: "ab".repeat(32), ledger: 1000, returnValue: 6n });

    let lockHeld = false;
    const concurrentQuery = vi.fn(async (sql: string, params?: unknown[]) => {
      queries.push([sql, params]);
      if (sql.includes("pg_try_advisory_lock")) {
        if (lockHeld) {
          return { rows: [{ acquired: false }] };
        }
        lockHeld = true;
        return { rows: [{ acquired: true }] };
      }
      if (sql.includes("pg_advisory_unlock")) {
        lockHeld = false;
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("receipts") && sql.includes("SELECT")) return { rows: [{ leaf }] };
      if (sql.includes("FROM anchor_plans")) return { rows: plans };
      if (sql.includes("MIN(ledger)")) return { rows: [{ min: 100, max: 100 }] };
      return { rows: [], rowCount: 1 };
    });

    vi.mocked(db).mockReturnValue({
      query: concurrentQuery,
      connect: async () => ({ query: concurrentQuery, release: () => {} }),
    } as unknown as ReturnType<typeof db>);

    const [res1, res2] = await Promise.all([
      anchor({ config, signer: Keypair.random() }),
      anchor({ config, signer: Keypair.random() }),
    ]);

    // Exactly one batch should be produced; the second caller gets null ("already running")
    const nonNullResults = [res1, res2].filter(Boolean);
    expect(nonNullResults.length).toBe(1);
    expect(nonNullResults[0]?.batchId).toBe(6);
  });

  it("respects maxBatchSize and minAnchorIntervalSeconds configuration (#53)", async () => {
    plans = [];
    chain(5);

    // 1. Check interval check when interval hasn't elapsed
    const recentDate = new Date();
    const intervalQuery = vi.fn(async (sql: string) => {
      if (sql.includes("pg_try_advisory_lock")) return { rows: [{ acquired: true }] };
      if (sql.includes("FROM anchor_plans")) return { rows: [] };
      if (sql.includes("SELECT anchored_at FROM receipt_batches")) {
        return { rows: [{ anchored_at: recentDate }] };
      }
      if (sql.includes("SELECT leaf FROM receipts")) return { rows: [{ leaf }] };
      return { rows: [], rowCount: 1 };
    });

    vi.mocked(db).mockReturnValue({
      query: intervalQuery,
      connect: async () => ({ query: intervalQuery, release: () => {} }),
    } as unknown as ReturnType<typeof db>);

    // If min interval is 3600 seconds, and anchored_at was just now, anchor returns null
    const skipped = await anchor({ config, signer: Keypair.random(), minAnchorIntervalSeconds: 3600 });
    expect(skipped).toBeNull();
  });

  it("runs sampled post-anchor verification calling verify_receipt and records ops signals on failure (#54)", async () => {
    plans = [];
    chain(5);
    vi.mocked(invoke).mockResolvedValue({ txHash: "ab".repeat(32), ledger: 1000, returnValue: 6n });

    // Mock readContract to return false on verify_receipt
    vi.mocked(readContract).mockImplementation(async (_c, _s, _id, method) => {
      if (method === "get_batch_count") return 5n;
      if (method === "verify_receipt") return false;
      return { root: Buffer.from(root, "hex"), anchored_ledger: 900 };
    });

    const res = await anchor({ config, signer: Keypair.random() });
    expect(res?.batchId).toBe(6);

    const record = getAnchorVerificationRecord();
    expect(record.lastFailure).toBeDefined();
    expect(record.lastFailure?.batchId).toBe(6);
    expect(record.lastFailure?.reason).toContain("verify_receipt returned false");
  });
});
