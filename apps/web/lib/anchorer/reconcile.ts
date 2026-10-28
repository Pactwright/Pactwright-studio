/**
 * Reconcile DB with on-chain batches to recover from crashes between submit and DB write. ROADMAP S-04.
 */
import { db } from "@/lib/db";
import { buildMerkleTree } from "@/lib/anchorer/batch";

export interface ReconcileResult {
  recoveredBatches: number;
  recoveredReceipts: number;
}

/**
 * Reconciles receipt_batches and receipts.
 * If a batch was created or submitted to chain, but the process crashed before
 * updating receipts with their batch_id and proofs, reconcile restores them.
 */
export async function reconcile(): Promise<ReconcileResult> {
  const pool = db();

  const mismatchedBatches = await pool.query<{
    batch_id: string;
    root: string;
    leaf_count: number;
    assigned_count: string;
  }>(
    `SELECT b.batch_id, b.root, b.leaf_count, COUNT(r.leaf) as assigned_count
     FROM receipt_batches b
     LEFT JOIN receipts r ON b.batch_id = r.batch_id
     GROUP BY b.batch_id, b.root, b.leaf_count
     HAVING COUNT(r.leaf) < b.leaf_count`
  );

  let recoveredBatches = 0;
  let recoveredReceipts = 0;

  for (const batch of mismatchedBatches.rows) {
    const batchId = Number(batch.batch_id);
    const expectedRoot = batch.root.trim().toLowerCase();

    // Look for pending unanchored receipts
    const pendingRes = await pool.query<{ leaf: string }>(
      "SELECT leaf FROM receipts WHERE batch_id IS NULL ORDER BY leaf ASC"
    );

    if (pendingRes.rows.length === 0) continue;

    const pendingLeaves = pendingRes.rows.map((r) => r.leaf.trim());
    const candidateLeaves = pendingLeaves.slice(0, batch.leaf_count);

    try {
      const { root, proofs } = buildMerkleTree(candidateLeaves);
      if (root.toLowerCase() === expectedRoot) {
        for (const [leaf, proof] of proofs.entries()) {
          await pool.query(
            "UPDATE receipts SET batch_id = $1, proof = $2 WHERE leaf = $3",
            [batchId, JSON.stringify(proof), leaf]
          );
          recoveredReceipts++;
        }
        recoveredBatches++;
      }
    } catch {
      // Merkle build failed on candidate slice; continue checking
    }
  }

  return { recoveredBatches, recoveredReceipts };
}
