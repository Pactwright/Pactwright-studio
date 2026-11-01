/**
 * Anchorer: reconcile with the chain → plan a batch → `ReceiptAnchor.anchor_batch` → proofs.
 * ROADMAP S-04. Core-team-only path.
 */
import { Keypair, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import { db } from "@/lib/db";
import { chainConfig, invoke, readContract, type ChainConfig } from "@/lib/chain";
import { reconcile } from "@/lib/anchorer/reconcile";
import { buildBatch } from "@/lib/anchorer/batch";

/** ReceiptAnchor v0.2.0 MAX_BATCH_SIZE. */
export const MAX_LEAVES_PER_BATCH = 1000;

/** Postgres advisory lock identifier for serializing anchor runs (ROADMAP S-04, #52). */
export const ANCHOR_LOCK_KEY = 849204820;

export interface AnchorOptions {
  maxBatchSize?: number;
  minAnchorIntervalSeconds?: number;
  config?: ChainConfig;
  signer?: Keypair;
}

export interface AnchorResult {
  batchId: number;
  root: string;
  leaves: number;
  anchorTx: string;
  anchoredLedger: number;
}

export interface AnchorVerificationRecord {
  lastVerifiedBatchId?: number;
  lastVerifiedAt?: Date;
  lastFailure?: {
    batchId: number;
    leaf: string;
    reason: string;
    at: Date;
  };
}

let verificationRecord: AnchorVerificationRecord = {};

export function recordAnchorVerificationSuccess(batchId: number): void {
  verificationRecord = {
    ...verificationRecord,
    lastVerifiedBatchId: batchId,
    lastVerifiedAt: new Date(),
    lastFailure: undefined,
  };
}

export function recordAnchorVerificationFailure(batchId: number, leaf: string, reason: string): void {
  verificationRecord = {
    ...verificationRecord,
    lastFailure: {
      batchId,
      leaf,
      reason,
      at: new Date(),
    },
  };
}

export function getAnchorVerificationRecord(): AnchorVerificationRecord {
  return verificationRecord;
}

export function resetAnchorVerificationRecord(): void {
  verificationRecord = {};
}

/**
 * The ReceiptAnchor admin key. Testnet may use a raw `ANCHORER_SECRET`; pubnet must not, and a
 * KMS signer (`ANCHORER_SECRET_REF`) isn't implemented yet.
 */
export function anchorerKey(env: NodeJS.ProcessEnv = process.env): Keypair {
  if (env.ANCHORER_SECRET_REF) throw new Error("ANCHORER_SECRET_REF (KMS) is not supported yet; use ANCHORER_SECRET on testnet");
  const secret = env.ANCHORER_SECRET?.trim();
  if (!secret) throw new Error("ANCHORER_SECRET is not set");
  if (env.STELLAR_NETWORK === "pubnet") throw new Error("refusing a raw anchorer secret on pubnet");
  return Keypair.fromSecret(secret);
}

/** One anchoring cycle. Returns null when there is nothing to anchor or a plan is still in flight. */
export async function anchor(options: AnchorOptions = {}): Promise<AnchorResult | null> {
  const config = options.config ?? chainConfig();
  const signer = options.signer ?? anchorerKey();
  const pool = db();

  const maxBatchSize =
    options.maxBatchSize ??
    (process.env.ANCHOR_MAX_BATCH_SIZE ? parseInt(process.env.ANCHOR_MAX_BATCH_SIZE, 10) : 100);
  const minAnchorIntervalSeconds =
    options.minAnchorIntervalSeconds ??
    (process.env.ANCHOR_MIN_INTERVAL_SECONDS ? parseInt(process.env.ANCHOR_MIN_INTERVAL_SECONDS, 10) : 0);

  // Advisory lock around the entire cycle: prevents two concurrent cycles from planning
  // the same batch ID or invoking anchor_batch simultaneously (ROADMAP S-04, #52).
  const lockClient = await pool.connect();
  let locked = false;
  try {
    const lockRes = await lockClient.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS acquired",
      [ANCHOR_LOCK_KEY],
    );
    locked = Boolean(lockRes.rows[0]?.acquired);
    if (!locked) {
      console.warn("Anchoring cycle skipped: another anchor instance holds the advisory lock");
      return null;
    }

    // 1. Settle any plan from an interrupted run before planning a new batch.
    const rec = await reconcile(config, signer.publicKey());
    if (rec.inFlight) return null;

    // 2. Plan: pending leaves, sorted, at most ReceiptAnchor's batch limit.
    const batch = await buildBatch(Math.min(maxBatchSize, MAX_LEAVES_PER_BATCH), minAnchorIntervalSeconds);
    if (!batch) return null;
    const batchId = rec.chainBatchCount + 1;
    await pool.query("INSERT INTO anchor_plans (batch_id, root, leaves) VALUES ($1, $2, $3)", [
      batchId,
      batch.root,
      JSON.stringify(batch.leaves),
    ]);

    // 3. Anchor. The period is the ledger range of the receipts in the batch.
    const ledgers = await pool.query<{ min: number; max: number }>(
      "SELECT MIN(ledger) AS min, MAX(ledger) AS max FROM receipts WHERE leaf = ANY($1)",
      [batch.leaves],
    );
    const { min, max } = ledgers.rows[0] ?? { min: 0, max: 0 };
    const sent = await invoke(config, signer, config.receiptAnchorId, "anchor_batch", [
      xdr.ScVal.scvBytes(Buffer.from(batch.root, "hex")),
      nativeToScVal(batch.leafCount, { type: "u32" }),
      nativeToScVal(BigInt(min ?? 0), { type: "u64" }),
      nativeToScVal(BigInt(max ?? 0), { type: "u64" }),
    ]);
    const assigned = Number(sent.returnValue);
    if (assigned !== batchId) {
      throw new Error(`ReceiptAnchor assigned batch ${assigned}, expected ${batchId}; reconcile will repair the plan`);
    }

    // 4. Save the batch and every proof, and close the plan, in one transaction.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO receipt_batches (batch_id, root, leaf_count, anchor_tx, anchored_at, anchored_ledger)
         VALUES ($1, $2, $3, $4, now(), $5)`,
        [batchId, batch.root, batch.leafCount, sent.txHash, sent.ledger],
      );
      for (const [leaf, proof] of batch.proofs) {
        await client.query("UPDATE receipts SET batch_id = $1, proof = $2 WHERE leaf = $3", [batchId, JSON.stringify(proof), leaf]);
      }
      await client.query("DELETE FROM anchor_plans WHERE batch_id = $1", [batchId]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    // 5. Sampled post-anchor read verifying the on-chain root (ROADMAP XC-03, S-04, S-10, #54).
    if (batch.leaves.length > 0) {
      const sampleLeaf = batch.leaves[0];
      const sampleProof = batch.proofs.get(sampleLeaf) ?? [];
      try {
        const verified = await readContract(config, signer.publicKey(), config.receiptAnchorId, "verify_receipt", [
          xdr.ScVal.scvU64(new xdr.Uint64(BigInt(batchId))),
          xdr.ScVal.scvBytes(Buffer.from(sampleLeaf, "hex")),
          xdr.ScVal.scvVec(sampleProof.map((p) => xdr.ScVal.scvBytes(Buffer.from(p, "hex")))),
        ]);
        if (!verified) {
          recordAnchorVerificationFailure(batchId, sampleLeaf, "On-chain verify_receipt returned false");
        } else {
          recordAnchorVerificationSuccess(batchId);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        recordAnchorVerificationFailure(batchId, sampleLeaf, msg);
      }
    }

    return { batchId, root: batch.root, leaves: batch.leafCount, anchorTx: sent.txHash, anchoredLedger: sent.ledger };
  } finally {
    if (locked) {
      await lockClient.query("SELECT pg_advisory_unlock($1)", [ANCHOR_LOCK_KEY]).catch(() => {});
    }
    lockClient.release();
  }
}
