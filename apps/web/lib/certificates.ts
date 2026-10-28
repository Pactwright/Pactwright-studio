/**
 * Certificate queries and formatting. ROADMAP S-05.
 * Matches CertificateSchema from @pactwright/core.
 */
import { db } from "@/lib/db";

export interface CertificateResponse {
  pactId: string;
  transition: "paid" | "settled" | "released" | "refunded";
  toSeller: string;
  toBuyer: string;
  envelopeHash?: string;
  leaf: string;
  status: "pending" | "anchored";
  proof?: string[];
  shardId?: number;
  batchId?: number;
  root?: string;
  receiptAnchor: string;
  txs: Array<{ stage: string; hash: string }>;
}

export async function getCertificateById(id: string): Promise<CertificateResponse | null> {
  const pool = db();
  const receiptResult = await pool.query(
    `SELECT
       r.leaf,
       r.pact_id,
       r.transition,
       r.batch_id,
       r.proof,
       p.to_seller,
       p.to_buyer,
       b.shard_id,
       b.root,
       b.anchor_tx,
       v.envelope_hash
     FROM receipts r
     JOIN pacts p ON r.pact_id = p.pact_id
     LEFT JOIN receipt_batches b ON r.batch_id = b.batch_id
     LEFT JOIN verdicts v ON p.pact_id = v.pact_id
     WHERE r.pact_id = $1 OR r.leaf = $1
     ORDER BY (r.batch_id IS NOT NULL) DESC, r.leaf ASC
     LIMIT 1`,
    [id]
  );

  if (receiptResult.rows.length === 0) {
    return null;
  }

  const row = receiptResult.rows[0];

  const eventsResult = await pool.query<{ stage: string; tx_hash: string }>(
    "SELECT stage, tx_hash FROM pact_events WHERE pact_id = $1 AND tx_hash IS NOT NULL ORDER BY id ASC",
    [row.pact_id]
  );

  const isAnchored = row.batch_id != null && row.root != null;
  const proof = Array.isArray(row.proof) ? (row.proof as string[]) : undefined;

  return {
    pactId: row.pact_id.trim(),
    transition: row.transition,
    toSeller: String(row.to_seller),
    toBuyer: String(row.to_buyer),
    envelopeHash: row.envelope_hash ? row.envelope_hash.trim() : undefined,
    leaf: row.leaf.trim(),
    status: isAnchored ? "anchored" : "pending",
    proof: isAnchored ? proof : undefined,
    shardId: isAnchored && row.shard_id != null ? Number(row.shard_id) : undefined,
    batchId: isAnchored && row.batch_id != null ? Number(row.batch_id) : undefined,
    root: isAnchored && row.root ? row.root.trim() : undefined,
    receiptAnchor:
      process.env.RECEIPT_ANCHOR_CONTRACT_ID ||
      "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    txs: eventsResult.rows.map((e) => ({
      stage: e.stage,
      hash: e.tx_hash,
    })),
  };
}
