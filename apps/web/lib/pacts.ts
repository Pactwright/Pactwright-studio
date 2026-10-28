/**
 * Pact queries and formatting. ROADMAP S-05.
 */
import { db } from "@/lib/db";
import type { PactRow, PactEventRow } from "@/lib/types";

export interface PactDetails {
  pact: PactRow;
  events: PactEventRow[];
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
