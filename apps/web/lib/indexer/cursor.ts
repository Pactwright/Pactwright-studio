/**
 * Ledger cursor management per source in sync_state. ROADMAP S-02.
 */
import { db } from "@/lib/db";

export async function getCursor(source: string, defaultLedger = 0): Promise<number> {
  const pool = db();
  const res = await pool.query<{ cursor_ledger: number }>(
    "SELECT cursor_ledger FROM sync_state WHERE source = $1",
    [source]
  );
  if (res.rows.length === 0) {
    return defaultLedger;
  }
  return res.rows[0].cursor_ledger;
}

export async function advance(source: string, ledger: number): Promise<void> {
  const pool = db();
  await pool.query(
    `INSERT INTO sync_state (source, cursor_ledger)
     VALUES ($1, $2)
     ON CONFLICT (source)
     DO UPDATE SET cursor_ledger = GREATEST(sync_state.cursor_ledger, EXCLUDED.cursor_ledger)`,
    [source, ledger]
  );
}
