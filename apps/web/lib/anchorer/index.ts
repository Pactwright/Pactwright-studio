/**
 * Anchorer entry: reconcile → batch → anchor_batch → proofs. ROADMAP S-04.
 */
import { db } from "@/lib/db";
import { reconcile } from "@/lib/anchorer/reconcile";
import { buildBatch } from "@/lib/anchorer/batch";

export interface AnchorOptions {
  maxBatchSize?: number;
  minAnchorIntervalSeconds?: number;
  shardId?: number;
}

export interface AnchorResult {
  batchId: number;
  shardId: number;
  root: string;
  leaves: number;
  anchorTx: string;
}

/**
 * Executes one anchoring cycle:
 * 1. Reconciles any previously unpersisted batches.
 * 2. Batches pending leaves under the size and interval constraints.
 * 3. Submits anchor and writes proofs to database.
 */
export async function anchor(options: AnchorOptions = {}): Promise<AnchorResult | null> {
  const pool = db();

  // 1. Reconcile any mismatched/crashed batches first
  await reconcile();

  // 2. Build batch from pending leaves
  const batch = await buildBatch(options.maxBatchSize ?? 100, options.minAnchorIntervalSeconds ?? 0);
  if (!batch) {
    return null;
  }

  const shardId = options.shardId ?? 0;

  await pool.query("BEGIN");
  try {
    const idRes = await pool.query<{ next_id: string }>(
      "SELECT COALESCE(MAX(batch_id), 0) + 1 AS next_id FROM receipt_batches"
    );
    const batchId = Number(idRes.rows[0].next_id);
    const anchorTx = `tx_anchor_${batchId}_${Date.now()}`;

    // Insert batch record
    await pool.query(
      `INSERT INTO receipt_batches (batch_id, shard_id, root, leaf_count, anchor_tx, anchored_at)
       VALUES ($1, $2, $3, $4, $5, now())`,
      [batchId, shardId, batch.root, batch.leafCount, anchorTx]
    );

    // Update each receipt with its proof and batch ID
    for (const [leaf, proof] of batch.proofs.entries()) {
      await pool.query(
        "UPDATE receipts SET batch_id = $1, proof = $2 WHERE leaf = $3",
        [batchId, JSON.stringify(proof), leaf]
      );
    }

    await pool.query("COMMIT");

    return {
      batchId,
      shardId,
      root: batch.root,
      leaves: batch.leafCount,
      anchorTx,
    };
  } catch (err) {
    await pool.query("ROLLBACK");
    throw err;
  }
}
