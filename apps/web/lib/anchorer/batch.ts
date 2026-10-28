/**
 * Merkle tree generation and pending receipt batching. ROADMAP S-04.
 * Uses sorted-pair SHA-256 Merkle trees matching Accensa ReceiptAnchor (FR-R1, FR-R2).
 */
import { db } from "@/lib/db";
import { createHash } from "node:crypto";
import { verifyReceipt } from "@/lib/verify";

export interface BatchPlan {
  root: string;
  leaves: string[];
  proofs: Map<string, string[]>;
  leafCount: number;
}

/**
 * Computes sorted-pair SHA-256 hash of two 32-byte hex digests.
 */
function combineSorted(a: string, b: string): string {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  const combined = Buffer.compare(bufA, bufB) <= 0
    ? Buffer.concat([bufA, bufB])
    : Buffer.concat([bufB, bufA]);
  return createHash("sha256").update(combined).digest("hex");
}

/**
 * Builds a Merkle tree and generates sorted-pair proofs for all leaves.
 */
export function buildMerkleTree(leaves: string[]): {
  root: string;
  proofs: Map<string, string[]>;
} {
  if (leaves.length === 0) {
    throw new Error("Cannot build Merkle tree with 0 leaves");
  }

  const cleanLeaves = leaves.map((l) => l.trim().toLowerCase());
  const proofs = new Map<string, string[]>();
  for (const leaf of cleanLeaves) {
    proofs.set(leaf, []);
  }

  if (cleanLeaves.length === 1) {
    // Single leaf root is the leaf itself
    return { root: cleanLeaves[0], proofs };
  }

  // Track the current level nodes with the leaf indices they cover
  let currentLevel: Array<{ hash: string; leafIndices: number[] }> = cleanLeaves.map((leaf, idx) => ({
    hash: leaf,
    leafIndices: [idx],
  }));

  while (currentLevel.length > 1) {
    const nextLevel: Array<{ hash: string; leafIndices: number[] }> = [];

    for (let i = 0; i < currentLevel.length; i += 2) {
      if (i + 1 < currentLevel.length) {
        const left = currentLevel[i];
        const right = currentLevel[i + 1];
        const parentHash = combineSorted(left.hash, right.hash);

        // Add sibling to left leaves' proofs
        for (const idx of left.leafIndices) {
          proofs.get(cleanLeaves[idx])!.push(right.hash);
        }
        // Add sibling to right leaves' proofs
        for (const idx of right.leafIndices) {
          proofs.get(cleanLeaves[idx])!.push(left.hash);
        }

        nextLevel.push({
          hash: parentHash,
          leafIndices: [...left.leafIndices, ...right.leafIndices],
        });
      } else {
        // Odd node promoted to next level
        nextLevel.push(currentLevel[i]);
      }
    }

    currentLevel = nextLevel;
  }

  const root = currentLevel[0].hash;

  // Sanity check all proofs verify with verifyReceipt
  for (const leaf of cleanLeaves) {
    const proof = proofs.get(leaf)!;
    if (!verifyReceipt(leaf, proof, root)) {
      throw new Error(`Internal error: generated proof failed verifyReceipt for leaf ${leaf}`);
    }
  }

  return { root, proofs };
}

/**
 * Picks pending receipt leaves (≤ maxBatchSize, ≥ minAnchorInterval) and builds the batch.
 */
export async function buildBatch(
  maxBatchSize = 100,
  minAnchorIntervalSeconds = 0
): Promise<BatchPlan | null> {
  const pool = db();

  // Check min anchor interval
  if (minAnchorIntervalSeconds > 0) {
    const lastBatchRes = await pool.query<{ anchored_at: Date }>(
      "SELECT anchored_at FROM receipt_batches ORDER BY batch_id DESC LIMIT 1"
    );
    if (lastBatchRes.rows.length > 0) {
      const lastAnchored = new Date(lastBatchRes.rows[0].anchored_at).getTime();
      const now = Date.now();
      if (now - lastAnchored < minAnchorIntervalSeconds * 1000) {
        return null; // Interval not elapsed
      }
    }
  }

  // Fetch pending receipts (batch_id is null)
  const pendingRes = await pool.query<{ leaf: string }>(
    "SELECT leaf FROM receipts WHERE batch_id IS NULL ORDER BY leaf ASC LIMIT $1",
    [maxBatchSize]
  );

  if (pendingRes.rows.length === 0) {
    return null;
  }

  const leaves = pendingRes.rows.map((r) => r.leaf.trim());
  const { root, proofs } = buildMerkleTree(leaves);

  return {
    root,
    leaves,
    proofs,
    leafCount: leaves.length,
  };
}
