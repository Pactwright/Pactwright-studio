import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the db module
vi.mock("@/lib/db", () => {
  return {
    db: vi.fn(),
  };
});

import { db } from "@/lib/db";
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

describe("Anchorer reconciliation & crash recovery", () => {
  const mockQuery = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db).mockReturnValue({
      query: mockQuery,
    } as unknown as ReturnType<typeof db>);
    mockQuery.mockResolvedValue({ rows: [] });
  });

  it("recovers unlinked receipts when server crashed after batch creation", async () => {
    const leaf = "1111111111111111111111111111111111111111111111111111111111111111";
    const { root } = buildMerkleTree([leaf]);

    // 1. Mismatched batch: batch recorded on chain/DB with leaf_count = 1, but assigned_count = 0
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          batch_id: "5",
          root,
          leaf_count: 1,
          assigned_count: "0",
        },
      ],
    });

    // 2. Pending unassigned receipts
    mockQuery.mockResolvedValueOnce({
      rows: [{ leaf }],
    });

    // Run reconcile
    const result = await reconcile();

    expect(result.recoveredBatches).toBe(1);
    expect(result.recoveredReceipts).toBe(1);

    // Verify UPDATE query was executed
    const updateCall = mockQuery.mock.calls.find((call) =>
      String(call[0]).includes("UPDATE receipts SET batch_id = $1")
    );
    expect(updateCall).toBeDefined();
    expect(updateCall?.[1]?.[0]).toBe(5); // batchId
    expect(updateCall?.[1]?.[2]).toBe(leaf);
  });
});
