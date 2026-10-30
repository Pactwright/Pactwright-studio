/**
 * Pact queries and formatting. ROADMAP S-05.
 */
import { db } from "@/lib/db";
import type { PactRow, PactEventRow } from "@/lib/types";

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
