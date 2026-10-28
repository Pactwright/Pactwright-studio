/**
 * Indexer entry: pact events, facilitator settlements, RefundVault refunds; idempotent writes. ROADMAP S-02.
 */
import { db } from "@/lib/db";
import { getCursor, advance } from "@/lib/indexer/cursor";
import { fetchEvents, type DecodedEvent } from "@/lib/indexer/sources";
import { computeReceiptLeaf } from "@/lib/verify";
import type { Transition } from "@/lib/types";

export interface SyncOptions {
  source?: string;
  fromLedger?: number;
  toLedger?: number;
  events?: DecodedEvent[];
}

export interface SyncResult {
  fromLedger: number;
  toLedger: number;
  indexedCount: number;
}

/**
 * Persists decoded events idempotently into Postgres.
 * Re-running sync over the same ledgers will not mutate state or duplicate rows.
 */
export async function persistEvents(events: DecodedEvent[]): Promise<number> {
  if (events.length === 0) return 0;
  const pool = db();

  let count = 0;

  for (const ev of events) {
    await pool.query("BEGIN");
    try {
      if (ev.stage === "opened" && ev.buyer && ev.seller) {
        await pool.query(
          `INSERT INTO pacts (
             pact_id, mode, buyer, seller, resource_url, cap, condition_hash,
             condition, metered, silence, state, verdict_deadline, settle_deadline,
             to_seller, to_buyer
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
           ON CONFLICT (pact_id) DO UPDATE SET
             state = COALESCE(EXCLUDED.state, pacts.state),
             updated_at = now()`,
          [
            ev.pactId,
            ev.mode ?? "escrow",
            ev.buyer,
            ev.seller,
            ev.resourceUrl ?? "",
            ev.cap ?? "0",
            ev.conditionHash ?? "0000000000000000000000000000000000000000000000000000000000000000",
            JSON.stringify(ev.condition ?? {}),
            Boolean(ev.metered),
            ev.silence ?? null,
            ev.pactState ?? "funded",
            ev.verdictDeadline ?? null,
            ev.settleDeadline ?? null,
            ev.toSeller ?? "0",
            ev.toBuyer ?? "0",
          ]
        );
      } else if (ev.pactState || ev.toSeller || ev.toBuyer) {
        await pool.query(
          `UPDATE pacts
           SET state = COALESCE($2, state),
               to_seller = GREATEST(to_seller, $3::numeric),
               to_buyer = GREATEST(to_buyer, $4::numeric),
               updated_at = now()
           WHERE pact_id = $1`,
          [
            ev.pactId,
            ev.pactState ?? null,
            ev.toSeller ?? "0",
            ev.toBuyer ?? "0",
          ]
        );
      }

      // 2. Insert event record (idempotent via unique constraint)
      await pool.query(
        `INSERT INTO pact_events (pact_id, stage, tx_hash, ledger, data)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (tx_hash, stage, pact_id) DO NOTHING`,
        [ev.pactId, ev.stage, ev.txHash, ev.ledger, JSON.stringify(ev.data)]
      );

      // 3. Insert verdict if present
      if (ev.stage === "verdict" && ev.envelopeHash) {
        await pool.query(
          `INSERT INTO verdicts (envelope_hash, pact_id, milestone, verdict, amount, envelope, attested)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (envelope_hash) DO NOTHING`,
          [
            ev.envelopeHash,
            ev.pactId,
            String(ev.data.milestone ?? "delivery"),
            String(ev.data.verdict ?? "ALLOW"),
            ev.data.amount != null ? String(ev.data.amount) : null,
            JSON.stringify(ev.data),
            true,
          ]
        );
      }

      // 4. If terminal transition, insert pending receipt leaf
      const isTerminal = ["paid", "settled", "released", "refunded"].includes(ev.stage);
      if (isTerminal) {
        const transition = ev.stage as Transition;
        const leaf = computeReceiptLeaf({
          pactId: ev.pactId,
          transition,
          toSeller: ev.toSeller ?? "0",
          toBuyer: ev.toBuyer ?? "0",
          envelopeHash: ev.envelopeHash,
          ledger: ev.ledger,
        });

        await pool.query(
          `INSERT INTO receipts (leaf, pact_id, transition, batch_id, proof)
           VALUES ($1, $2, $3, null, null)
           ON CONFLICT (leaf) DO NOTHING`,
          [leaf, ev.pactId, transition]
        );
      }

      // 5. Advance cursor
      await advance(ev.source, ev.ledger);

      await pool.query("COMMIT");
      count++;
    } catch (err) {
      await pool.query("ROLLBACK");
      throw err;
    }
  }

  return count;
}

/**
 * Runs indexer synchronization for one or all sources.
 */
export async function sync(options: SyncOptions = {}): Promise<SyncResult> {
  const source = options.source ?? "pact";
  const fromLedger = options.fromLedger ?? (await getCursor(source, 0));
  const toLedger = options.toLedger ?? fromLedger + 100;

  const events = options.events ?? (await fetchEvents(source, fromLedger, toLedger));
  const indexedCount = await persistEvents(events);

  if (events.length > 0) {
    const maxLedger = Math.max(...events.map((e) => e.ledger));
    await advance(source, maxLedger);
  }

  return {
    fromLedger,
    toLedger,
    indexedCount,
  };
}
