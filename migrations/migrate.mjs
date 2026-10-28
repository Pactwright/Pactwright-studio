#!/usr/bin/env node
/**
 * Database migration runner. ROADMAP S-01.
 * Applies numbered SQL migrations in alphabetical order within a transaction.
 */
import { readdir, readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "../apps/web/node_modules/pg/lib/index.js";

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

export async function runMigrations(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required to run migrations.");
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const files = (await readdir(__dirname))
      .filter((file) => /^\d+.*\.sql$/.test(file))
      .sort();

    console.log(`Found ${files.length} migration file(s) in ${__dirname}`);

    for (const file of files) {
      const filePath = resolve(__dirname, file);
      const sql = await readFile(filePath, "utf-8");
      console.log(`Applying migration: ${file}...`);
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("COMMIT");
      console.log(`✓ Applied: ${file}`);
    }

    console.log("All migrations applied successfully.");
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
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Migration failed:", err.message);
      process.exit(1);
    });
}
