/**
 * #94: the dashboard queries are indexed, and only by indexes that were measured to change a plan.
 *
 * `migrations/006_dashboard_indexes.sql` went in after each candidate was run through `explain (analyze)`
 * on Postgres 16.15 at 500 sellers / 10,000 agents / 30,000 budgets / 60,000 pacts, in two databases
 * built from these same migration files. Four indexes changed a plan and are in the file; five plausible
 * ones did not, and the reasons are written into the migration header. That whole measurement is worth
 * exactly as long as nobody adds an index without it and nobody rewrites a `WHERE` clause out from under
 * the index that served it — which is what these tests enforce: the ledger below is derived from the real
 * SQL in `lib/merchant.ts`, `lib/principal.ts` and `lib/pacts.ts`, so a query that stops being covered
 * fails here instead of failing as a slow page in production.
 */
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MIGRATIONS = "../../../../migrations/";
const INDEX_MIGRATION = "006_dashboard_indexes.sql";

const readMigration = (name: string) => readFileSync(new URL(MIGRATIONS + name, import.meta.url), "utf8");
const readLib = (name: string) => readFileSync(new URL(`../../lib/${name}`, import.meta.url), "utf8");

interface Index {
  name: string;
  table: string;
  columns: string[];
}

/** `create index <name> on <table> (col [asc|desc], ...)`, ordering stripped. */
function parseCreateIndexes(sql: string): Index[] {
  return [...sql.matchAll(/create\s+index\s+(\w+)\s+on\s+(\w+)\s*\(([^)]*)\)/gi)].map(([, name, table, cols]) => ({
    name,
    table: table!.toLowerCase(),
    columns: cols!.split(",").map((c) => c.trim().split(/\s+/)[0]!.toLowerCase()),
  }));
}

/** The implicit indexes a `create table` declares: its `primary key` columns and each `unique (...)`. */
function parseTableKeys(sql: string): Index[] {
  const out: Index[] = [];
  for (const [, table, body] of sql.matchAll(/create\s+table\s+(\w+)\s*\(([\s\S]*?)\n\s*\);/gi)) {
    for (const [, cols] of body!.matchAll(/\n\s*unique\s*\(([^)]*)\)/gi)) {
      const columns = cols!.split(",").map((c) => c.trim().toLowerCase());
      out.push({ name: `${table}_${columns.join("_")}_key`, table: table!.toLowerCase(), columns });
    }
    for (const [, col] of body!.matchAll(/^\s*(\w+)\s+\w+(\([\d,]+\))?\s+(?:\w+\s+)*primary key/gim)) {
      out.push({ name: `${table}_pkey`, table: table!.toLowerCase(), columns: [col!.toLowerCase()] });
    }
  }
  return out;
}

/** Every index the schema has once all migrations are applied, from any migration file. */
function schemaIndexes(): Index[] {
  return migrationFiles().flatMap((f) => {
    const sql = readMigration(f);
    return [...parseCreateIndexes(sql), ...parseTableKeys(sql)];
  });
}

/** Directory order `migrations/migrate.mjs` will apply these in. */
function migrationFiles(): string[] {
  return readdirSync(new URL(MIGRATIONS, import.meta.url))
    .filter((f) => /^\d+.*\.sql$/.test(f))
    .sort();
}

/** SQL string literals in a lib file that read from a table. Anchored on `SELECT`, not on `from`, so a
 *  comment like "distinct principals from agents table" cannot be read as a query. */
function sqlLiterals(src: string): string[] {
  return [...src.matchAll(/"((?:SELECT|WITH)[\s\S]*?)"|`((?:SELECT|WITH)[\s\S]*?)`/gi)].map((m) => m[1] ?? m[2]!);
}

/** Columns a `WHERE` clause tests with `= $n`, `= ANY($n)` or `IN (...)`. */
function predicateColumns(sql: string): string[] {
  const clause = /\bwhere\b([\s\S]*?)(\border\s+by\b|\blimit\b|$)/i.exec(sql);
  if (!clause) return [];
  return [
    ...new Set(
      [...clause[1]!.matchAll(/\b([a-z_][a-z0-9_]*)\s*(?:=\s*\$|=\s*any\s*\(|\bin\s*\()/gi)].map((m) =>
        m[1]!.toLowerCase()
      )
    ),
  ];
}

/** Columns named by the query's `ORDER BY`, ordering stripped. */
function orderColumns(sql: string): string[] {
  const clause = /\border\s+by\b([\s\S]*?)(\blimit\b|$)/i.exec(sql);
  if (!clause) return [];
  return clause[1]!
    .split(",")
    .map((c) => c.trim().split(/\s+/)[0]!.toLowerCase())
    .filter((c) => /^[a-z_]+$/.test(c));
}

const tableOf = (sql: string) => /\bfrom\s+(\w+)/i.exec(sql)?.[1]!.toLowerCase() ?? "";

/**
 * One entry per query the dashboards and the collection page run, keyed by a fragment of its SQL that has
 * to still be there. `covered` is the index the measurement picked; `exempt` is a query that was measured
 * and left unindexed, with the phrase the migration header uses to explain why.
 */
const LEDGER: { file: string; sql: string; covered?: string; exempt?: string }[] = [
  {
    file: "merchant.ts",
    // The seller chooser reads the whole table to pick one, so only the sort is theirs to serve.
    sql: "FROM sellers ORDER BY created_at ASC",
    exempt: "sellers ORDER BY created_at",
  },
  { file: "merchant.ts", sql: "FROM routes WHERE seller = $1", covered: "routes_seller_resource_url_key" },
  { file: "merchant.ts", sql: "FROM pacts WHERE seller = $1", covered: "pacts_seller_state" },
  {
    file: "principal.ts",
    sql: "SELECT DISTINCT principal FROM agents ORDER BY principal ASC",
    exempt: "SELECT DISTINCT principal FROM agents",
  },
  { file: "principal.ts", sql: "FROM agents WHERE principal = $1", covered: "agents_principal_created" },
  { file: "principal.ts", sql: "FROM budgets WHERE agent = ANY($1)", covered: "budgets_agent" },
  {
    file: "principal.ts",
    sql: "WHERE buyer = ANY($1) AND state IN ('funded', 'paid', 'allowed')",
    covered: "pacts_buyer_state",
  },
];

describe("#94 the dashboard queries are covered by an index", () => {
  const indexes = schemaIndexes();

  it("finds the ledger's queries still in the code they were measured from", () => {
    for (const entry of LEDGER) {
      expect(readLib(entry.file), `${entry.file} no longer has the query ${entry.sql}`).toContain(entry.sql);
    }
  });

  it("indexes every equality predicate in those queries", () => {
    const unexplained: string[] = [];
    for (const entry of LEDGER) {
      if (entry.exempt) continue;
      const literal = sqlLiterals(readLib(entry.file)).find((q) => q.includes(entry.sql));
      expect(literal, `no SQL literal matches ${entry.sql}`).toBeDefined();
      const serving = indexes.find((i) => i.name === entry.covered)!;
      expect(serving, `${entry.covered} is not in any migration`).toBeDefined();
      expect(serving.table).toBe(tableOf(literal!));
      for (const column of predicateColumns(literal!)) {
        if (!serving.columns.includes(column)) unexplained.push(`${entry.sql} filters ${column}`);
      }
    }
    expect(unexplained).toEqual([]);
  });

  it("keeps every query those files run in the ledger", () => {
    // A new dashboard query is exactly the thing that gets an index added later without a measurement.
    for (const file of ["merchant.ts", "principal.ts"]) {
      const queries = sqlLiterals(readLib(file));
      const ledgered = LEDGER.filter((e) => e.file === file);
      expect(queries, file).toHaveLength(ledgered.length);
      for (const q of queries) {
        expect(ledgered.some((e) => q.includes(e.sql)), `${file}: ${q.slice(0, 60)} is not ledgered`).toBe(true);
      }
    }
  });

  it("serves the collection page's sort, and every filter the route can add", () => {
    const src = readLib("pacts.ts");
    const sorted = /ORDER BY created_at DESC, pact_id DESC/.exec(src);
    expect(sorted, "GET /api/pacts no longer sorts by (created_at, pact_id)").not.toBeNull();
    expect(orderColumns(sorted![0])).toEqual(["created_at", "pact_id"]);
    expect(indexes.find((i) => i.name === "pacts_recent")!.columns).toEqual(["created_at", "pact_id"]);

    // The route builds two optional predicates; each has to stay on an indexed path, and a third one
    // added without an index behind it fails here rather than as a seq scan in production.
    const filters = [...src.matchAll(/where\.push\(`(\w+) = \$/g)].map((m) => m[1]!.toLowerCase()).sort();
    expect(filters).toEqual(["seller", "state"]);
    const pactsColumns = indexes.filter((i) => i.table === "pacts").map((i) => i.columns);
    for (const column of filters) {
      expect(pactsColumns.some((cols) => cols.includes(column)), `no pacts index has ${column}`).toBe(true);
    }
  });

  it("records why each exempt query was measured and left unindexed", () => {
    const header = readMigration(INDEX_MIGRATION);
    for (const entry of LEDGER) {
      if (!entry.exempt) continue;
      expect(header, `${entry.exempt} needs its measured reason in the migration`).toContain(entry.exempt);
    }
  });
});

describe("#94 the index migration only carries measured indexes", () => {
  const ADDED = [
    { name: "agents_principal_created", table: "agents", columns: ["principal", "created_at"] },
    { name: "budgets_agent", table: "budgets", columns: ["agent"] },
    { name: "pacts_buyer_state", table: "pacts", columns: ["buyer", "state"] },
    { name: "pacts_recent", table: "pacts", columns: ["created_at", "pact_id"] },
  ];

  it("adds exactly the four indexes that changed a plan", () => {
    expect(parseCreateIndexes(readMigration(INDEX_MIGRATION))).toEqual(ADDED);
  });

  it("adds nothing but index creation", () => {
    // The header prose explains the measurements in plain SQL words, so only the statements are gated.
    const lines = readMigration(INDEX_MIGRATION)
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("--"));
    for (const line of lines) {
      expect(line.toLowerCase()).toMatch(/^create index \w+ on \w+ \([^;]+\);$/);
    }
    const code = lines.join("\n").toLowerCase();
    // Each of these would either change behaviour or fail inside the runner's transaction block.
    for (const forbidden of ["drop ", "alter table", "unique", "concurrently", "if not exists", "vacuum"]) {
      expect(code, forbidden).not.toContain(forbidden);
    }
  });

  it("names every index once, and only for a table an earlier migration created", () => {
    const names = migrationFiles().flatMap((f) => [...parseCreateIndexes(readMigration(f)), ...parseTableKeys(readMigration(f))].map((i) => i.name));
    expect(new Set(names).size).toBe(names.length);

    const created = migrationFiles().flatMap((f) =>
      [...readMigration(f).matchAll(/create\s+table\s+(\w+)/gi)].map((m) => m[1]!.toLowerCase())
    );
    for (const index of parseCreateIndexes(readMigration(INDEX_MIGRATION))) {
      expect(created, `${index.name} indexes a table no migration creates`).toContain(index.table);
    }
  });

  it("keeps migration numbers three digits so apply order stays numeric", () => {
    // migrate.mjs sorts file names as text, and it applies what /^\d+.*\.sql$/ matches: `9_x.sql` would
    // land after `10_x.sql`.
    for (const file of migrationFiles()) {
      expect(file, file).toMatch(/^\d{3}_[a-z0-9_]+\.sql$/);
    }
  });
});
