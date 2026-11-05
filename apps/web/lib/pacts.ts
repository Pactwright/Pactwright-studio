/**
 * Pact queries and formatting. ROADMAP S-05.
 */
import { db } from "@/lib/db";
import type { PactRow, PactEventRow, PactState } from "@/lib/types";

export interface PactDetails {
  pact: PactRow;
  events: PactEventRow[];
}

/** The most recently opened pacts, newest first. */
export async function listRecentPacts(limit = 8): Promise<PactRow[]> {
  const { rows } = await db().query<PactRow>("SELECT * FROM pacts ORDER BY created_at DESC LIMIT $1", [limit]);
  return rows;
}

export async function getPactById(pactId: string): Promise<PactDetails | null> {
  const pool = db();
  const pactResult = await pool.query<PactRow>(
    "SELECT * FROM pacts WHERE pact_id = $1",
    [pactId]
  );

  if (pactResult.rows.length === 0) {
    return null;
  }

  const eventsResult = await pool.query<PactEventRow>(
    "SELECT * FROM pact_events WHERE pact_id = $1 ORDER BY id ASC",
    [pactId]
  );

  return {
    pact: pactResult.rows[0],
    events: eventsResult.rows,
  };
}

/** One page of the pacts table, plus the cursor that addresses the page after it. #75. */
export interface PactPage {
  items: PactRow[];
  nextCursor: string | null;
}

export interface PactPageFilters {
  state?: PactState;
  seller?: string;
  /** The last pact of the previous page, decoded by `parsePactCursor`. */
  after?: PactCursor;
  limit: number;
}

/** Where a keyset page resumes: the sort key of the last row the caller already has. */
export interface PactCursor {
  createdAt: Date;
  pactId: string;
}

const PACT_ID = /^[0-9a-fA-F]{64}$/;

/**
 * The newest `limit` pacts, or the page after `after`.
 *
 * Keyset rather than OFFSET, because the explorer and agents page backwards through a table that the
 * indexer is still appending to: an offset shifts under a new row, so page 2 can repeat page 1 or drop
 * a pact entirely. `(created_at, pact_id) < (…, …)` needs the id as the tie-break because two pacts
 * opened in the same ledger share a `created_at` to the microsecond, and one ORDER BY serves both the
 * rows and the cursor.
 *
 * Reads `limit + 1` rows so "is there another page" costs no second query, and never adds a `WHERE`
 * clause for a filter it was not given.
 */
export async function listPacts({ state, seller, after, limit }: PactPageFilters): Promise<PactPage> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (state) {
    params.push(state);
    where.push(`state = $${params.length}`);
  }
  if (seller) {
    params.push(seller);
    where.push(`seller = $${params.length}`);
  }
  if (after) {
    params.push(after.createdAt.toISOString(), after.pactId);
    where.push(
      `(created_at, pact_id) < ($${params.length - 1}::timestamptz, $${params.length}::text)`
    );
  }
  params.push(limit + 1);

  const { rows } = await db().query<PactRow>(
    `SELECT * FROM pacts ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ` +
      `ORDER BY created_at DESC, pact_id DESC LIMIT $${params.length}`,
    params
  );

  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return { items, nextCursor: rows.length > limit && last ? pactCursorOf(last) : null };
}

/** A cursor is an opaque keyset, not something a caller is meant to build or read. */
export function pactCursorOf(pact: Pick<PactRow, "pact_id" | "created_at">): string {
  const key = { t: pact.created_at.getTime(), i: pact.pact_id };
  return Buffer.from(JSON.stringify(key)).toString("base64url");
}

/** `null` for anything that is not a cursor this function produced, so the route can answer 400. */
export function parsePactCursor(value: string): PactCursor | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { t, i } = parsed as { t?: unknown; i?: unknown };
  // A cursor that decodes but names a pact that no longer exists is still a valid cursor: the query
  // resumes from that point and simply returns fewer rows.
  if (typeof t !== "number" || !Number.isFinite(t)) return null;
  if (typeof i !== "string" || !PACT_ID.test(i)) return null;
  return { createdAt: new Date(t), pactId: i };
}
