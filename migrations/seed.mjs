#!/usr/bin/env node
/**
 * Database seed runner. ROADMAP S-01.
 * Applies migrations/seed.sql to populate local development and test fixtures.
 */
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "../apps/web/node_modules/pg/lib/index.js";

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

export async function runSeed(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required to run seed data.");
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const seedPath = resolve(__dirname, "seed.sql");
    const sql = await readFile(seedPath, "utf-8");
    console.log("Applying seed data from seed.sql...");
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log("✓ Seed data applied successfully.");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback errors if connection died
    }
    throw err;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runSeed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Seed failed:", err.message);
      process.exit(1);
    });
}
