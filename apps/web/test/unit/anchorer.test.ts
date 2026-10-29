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
import { anchor } from "../../lib/anchorer";
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
    queries.length = 0;
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      queries.push([sql, params]);
      if (sql.includes("FROM anchor_plans")) return { rows: plans };
      if (sql.includes("SELECT leaf FROM receipts")) return { rows: [{ leaf }] };
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
});
