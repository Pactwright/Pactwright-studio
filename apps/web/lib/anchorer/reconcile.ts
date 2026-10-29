/**
 * Reconcile anchoring plans with the chain, so a crash between sending `anchor_batch` and saving
 * its result never anchors a batch twice or loses one. ROADMAP S-04.
 */
import { db } from "@/lib/db";
import { readContract, type ChainConfig } from "@/lib/chain";
import { buildMerkleTree } from "@/lib/anchorer/batch";
import { xdr } from "@stellar/stellar-sdk";

/** `anchor_batch` transactions expire after 60 s; a younger plan may still land. */
const PLAN_SETTLE_SECONDS = 120;

export interface ReconcileResult {
  /** Plans found on-chain and saved now. */
  recoveredBatches: number;
  recoveredReceipts: number;
  /** Plans whose transaction never landed; their leaves go back to pending. */
  droppedPlans: number;
  /** A plan is too recent to judge: its transaction may still land. Anchoring waits. */
  inFlight: boolean;
}

/** Reads ReceiptAnchor's batch count and settles every open plan against it. */
export async function reconcile(config: ChainConfig, source: string): Promise<ReconcileResult & { chainBatchCount: number }> {
  const pool = db();
  const chainBatchCount = Number(await readContract(config, source, config.receiptAnchorId, "get_batch_count", []));
  const result = { recoveredBatches: 0, recoveredReceipts: 0, droppedPlans: 0, inFlight: false, chainBatchCount };

  const plans = await pool.query<{ batch_id: string; root: string; leaves: string[]; age_seconds: number }>(
    "SELECT batch_id, root, leaves, EXTRACT(EPOCH FROM now() - created_at)::int AS age_seconds FROM anchor_plans ORDER BY batch_id",
  );
  for (const plan of plans.rows) {
    const batchId = Number(plan.batch_id);
    if (batchId > chainBatchCount && plan.age_seconds < PLAN_SETTLE_SECONDS) {
      result.inFlight = true;
      continue;
    }
    const onChain =
      batchId <= chainBatchCount
        ? ((await readContract(config, source, config.receiptAnchorId, "get_batch", [
            xdr.ScVal.scvU64(new xdr.Uint64(BigInt(batchId))),
          ])) as { root: Uint8Array; anchored_ledger: number })
        : null;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (onChain && Buffer.from(onChain.root).toString("hex") === plan.root.trim()) {
        const { proofs } = buildMerkleTree(plan.leaves);
        await client.query(
          `INSERT INTO receipt_batches (batch_id, root, leaf_count, anchor_tx, anchored_at, anchored_ledger)
           VALUES ($1, $2, $3, null, now(), $4) ON CONFLICT (batch_id) DO NOTHING`,
          [batchId, plan.root.trim(), plan.leaves.length, onChain.anchored_ledger],
        );
        for (const [leaf, proof] of proofs) {
          await client.query("UPDATE receipts SET batch_id = $1, proof = $2 WHERE leaf = $3", [batchId, JSON.stringify(proof), leaf]);
          result.recoveredReceipts++;
        }
        result.recoveredBatches++;
      } else {
        result.droppedPlans++;
      }
      await client.query("DELETE FROM anchor_plans WHERE batch_id = $1", [batchId]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
  return result;
}
