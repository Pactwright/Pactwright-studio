/** Postgres pool. ROADMAP S-01. */
import { Pool } from "pg";

let pool: Pool | undefined;

export function db(): Pool {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}
