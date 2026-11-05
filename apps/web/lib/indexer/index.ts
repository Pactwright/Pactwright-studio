/**
 * Indexer: reads `pact` and RefundVault events from Stellar RPC and writes them idempotently,
 * one database transaction per event. Every terminal transition becomes a pending receipt leaf
 * for the anchorer. ROADMAP S-02.
 */
import type { PoolClient } from "pg";
import { db } from "@/lib/db";
import { chainConfig, server, type ChainConfig } from "@/lib/chain";
import { getCursor, advance } from "@/lib/indexer/cursor";
import { fetchEvents, sources, type DecodedEvent } from "@/lib/indexer/sources";
import { computeReceiptLeaf } from "@/lib/verify";
import type { Transition } from "@/lib/types";

/** Stroops (integer string) → numeric(30,7) decimal string. */
export function stroopsToDecimal(stroops: string | bigint): string {
  const v = BigInt(stroops);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  return `${neg ? "-" : ""}${abs / 10_000_000n}.${(abs % 10_000_000n).toString().padStart(7, "0")}`;
}

export interface PersistResult {
  indexed: number;
  /**
   * Events for pacts Studio has not written yet — a refund whose `opened` event is still ahead of the
   * `pact` source's cursor, or an M0 pact the facilitator has not reported. Retained in
   * `deferred_events` and replayed on later passes, never dropped (#51).
   */
  deferred: number;
}

/** Writes decoded events. Re-running over the same events changes nothing. */
export async function persistEvents(events: DecodedEvent[]): Promise<PersistResult> {
  const result: PersistResult = { indexed: 0, deferred: 0 };
  if (events.length === 0) return result;
  const client = await db().connect();
  try {
    for (const ev of events) {
      await client.query("BEGIN");
      try {
        const written = await persistOne(client, ev);
        await client.query("COMMIT");
        if (written === "written") result.indexed++;
        else result.deferred++;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
  } finally {
    client.release();
  }
  return result;
}

type PersistOutcome = "written" | "deferred";

/** Keeps an event whose pact row does not exist yet, so a later pass can write it. */
async function deferEvent(client: PoolClient, ev: DecodedEvent): Promise<void> {
  await client.query(
    `INSERT INTO deferred_events (source, pact_id, stage, tx_hash, ledger, event)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (tx_hash, stage, pact_id) DO NOTHING`,
    [ev.source, ev.pactId, ev.stage, ev.txHash, ev.ledger, JSON.stringify(ev)],
  );
}

async function persistOne(client: PoolClient, ev: DecodedEvent): Promise<PersistOutcome> {
  if (ev.stage === "opened") {
    await client.query(
      `INSERT INTO pacts (pact_id, mode, buyer, seller, resource_url, cap, condition_hash, condition, metered,
                          silence, state, verdict_deadline, settle_deadline)
       VALUES ($1, 'escrow', $2, $3, '', $4, $5, '{}'::jsonb, $6, $7, 'funded', $8, $9)
       ON CONFLICT (pact_id) DO NOTHING`,
      [ev.pactId, ev.buyer, ev.seller, stroopsToDecimal(ev.cap!), ev.conditionHash, ev.metered, ev.silence, ev.verdictDeadline, ev.settleDeadline],
    );
  } else {
    const known = await client.query("SELECT 1 FROM pacts WHERE pact_id = $1", [ev.pactId]);
    if (known.rowCount === 0) {
      await deferEvent(client, ev);
      return "deferred";
    }
  }

  const inserted = await client.query(
    `INSERT INTO pact_events (pact_id, stage, tx_hash, ledger, data) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (tx_hash, stage, pact_id) DO NOTHING`,
    [ev.pactId, ev.stage, ev.txHash, ev.ledger, JSON.stringify(ev.data)],
  );
  if (inserted.rowCount === 0) return "written"; // already indexed

  if (ev.stage === "verdict") {
    await client.query(
      `INSERT INTO verdicts (envelope_hash, pact_id, milestone, verdict, amount, envelope, attested)
       VALUES ($1, $2, 'delivery', $3, $4, $5, true) ON CONFLICT DO NOTHING`,
      [ev.envelopeHash, ev.pactId, ev.verdict, stroopsToDecimal(ev.amount!), JSON.stringify(ev.data)],
    );
  }

  if (ev.pactState && ev.stage !== "opened") {
    const refund = ev.stage === "refunded";
    await client.query(
      `UPDATE pacts SET state = $2,
              to_seller = CASE WHEN $5 THEN to_seller ELSE COALESCE($3::numeric, to_seller) END,
              to_buyer  = CASE WHEN $5 THEN to_buyer + COALESCE($4::numeric, 0) ELSE COALESCE($4::numeric, to_buyer) END,
              updated_at = now()
        WHERE pact_id = $1`,
      [
        ev.pactId,
        ev.pactState,
        ev.toSeller !== undefined ? stroopsToDecimal(ev.toSeller) : null,
        ev.toBuyer !== undefined ? stroopsToDecimal(ev.toBuyer) : null,
        refund,
      ],
    );
  }

  const transition = terminalTransition(ev);
  if (transition) {
    // A settle or release carries the envelope of the pact's delivery verdict, when there is one.
    const envelopeHash =
      transition === "settled" || transition === "released"
        ? ((
            await client.query<{ envelope_hash: string }>(
              "SELECT envelope_hash FROM verdicts WHERE pact_id = $1 AND milestone = 'delivery' AND attested",
              [ev.pactId],
            )
          ).rows[0]?.envelope_hash ?? null)
        : null;
    const leafInput = {
      pactId: ev.pactId,
      transition,
      toSeller: ev.toSeller ?? "0",
      toBuyer: ev.toBuyer ?? "0",
      envelopeHash: ev.stage === "meter_closed" ? null : envelopeHash,
      ledger: ev.ledger,
    };
    await client.query(
      `INSERT INTO receipts (leaf, pact_id, transition, to_seller_stroops, to_buyer_stroops, envelope_hash, ledger)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (leaf) DO NOTHING`,
      [computeReceiptLeaf(leafInput), ev.pactId, transition, leafInput.toSeller, leafInput.toBuyer, leafInput.envelopeHash, ev.ledger],
    );
  }
  return "written";
}

function terminalTransition(ev: DecodedEvent): Transition | null {
  switch (ev.stage) {
    case "settled":
    case "meter_closed":
      return "settled";
    case "released":
      return "released";
    case "refunded":
      return "refunded";
    default:
      return null;
  }
}

/**
 * Events held back by a missing pact row, oldest ledger first. Bounded so a backlog cannot turn one
 * sync pass into an unbounded write loop; whatever is left is replayed by the next pass.
 */
const DEFERRED_REPLAY_BATCH = 500;

export interface ReplayResult {
  replayed: number;
  remaining: number;
}

/**
 * Retries the events `deferred_events` is holding, and forgets the ones whose pact has arrived.
 *
 * An event whose pact never arrives stays here, counted, rather than pinning a source's cursor — which
 * is why retention is a table and not a clamp.
 */
export async function replayDeferred(limit = DEFERRED_REPLAY_BATCH): Promise<ReplayResult> {
  const client = await db().connect();
  let replayed = 0;
  try {
    const held = await client.query<{ id: string; event: DecodedEvent }>(
      "SELECT id, event FROM deferred_events ORDER BY ledger, id LIMIT $1",
      [limit],
    );
    for (const row of held.rows) {
      await client.query("BEGIN");
      try {
        const outcome = await persistOne(client, row.event);
        if (outcome === "written") {
          await client.query("DELETE FROM deferred_events WHERE id = $1", [row.id]);
          replayed++;
        } else {
          await client.query(
            "UPDATE deferred_events SET attempts = attempts + 1, last_attempt_at = now() WHERE id = $1",
            [row.id],
          );
        }
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
    const count = await client.query<{ n: string }>("SELECT count(*) AS n FROM deferred_events");
    return { replayed, remaining: Number(count.rows[0]?.n ?? 0) };
  } finally {
    client.release();
  }
}

export class OutsideRetentionError extends Error {
  constructor(public readonly source: string, public readonly cursor: number, public readonly oldestLedger: number) {
    super(
      `${source}: cursor ${cursor} is older than the RPC's oldest ledger ${oldestLedger}. ` +
        "Events in between would be lost; backfill them from a history source before syncing (ROADMAP S-03).",
    );
    this.name = "OutsideRetentionError";
  }
}

export interface SyncResult {
  source: string;
  fromLedger: number;
  toLedger: number;
  indexed: number;
  deferred: number;
}

/** One pass over every source, plus what it left behind and what a replay recovered. */
export interface SyncReport {
  sources: SyncResult[];
  /** Deferred events written by this pass's replay. */
  replayed: number;
  /** Deferred events still waiting after the replay. */
  deferred: number;
}

/** One indexing pass over every source, from its cursor to the RPC's latest ledger. */
export async function sync(config: ChainConfig = chainConfig()): Promise<SyncReport> {
  const health = await server(config).getHealth();
  const results: SyncResult[] = [];
  for (const source of sources(config)) {
    const cursor = await getCursor(source.name, 0);
    // Re-read the cursor's own ledger: writes are idempotent, so a partly indexed ledger is safe.
    const fromLedger = cursor > 0 ? cursor : (config.startLedger ?? health.oldestLedger);
    if (fromLedger < health.oldestLedger) throw new OutsideRetentionError(source.name, fromLedger, health.oldestLedger);
    const page = await fetchEvents(source, fromLedger, config);
    const persisted = await persistEvents(page.events);
    // The cursor moves to what this pass actually read, never to the tip it has not read yet.
    await advance(source.name, page.throughLedger);
    results.push({ source: source.name, fromLedger, toLedger: page.throughLedger, ...persisted });
  }
  // `sources()` indexes `pact` first, so an event whose pact opened in this pass is already written; the
  // replay below is for the ones whose pact arrives on a later pass, or from another source (#51).
  const replay = await replayDeferred();
  return { sources: results, replayed: replay.replayed, deferred: replay.remaining };
}
