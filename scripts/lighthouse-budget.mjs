#!/usr/bin/env node
/**
 * Lighthouse budget on Studio's public pages. ROADMAP P7-20 (studio#89).
 *
 * Two modes:
 *   --run             build-and-measure: fetch each page from a server that is already up, write
 *                     `SAMPLES` Lighthouse JSON reports per page, then judge them.
 *   --evaluate-only   judge reports that already exist (used by the unit tests, and by a rerun of
 *                     the gate against an artifact without measuring again).
 *
 * The budget is three categories at 90 on mobile, for every page, on the median of the samples.
 * The median is what Lighthouse CI judges, and a single sample is not usable here: a cold
 * `next start` answers its first request while V8 and the page's own modules are still warming,
 * which on `/` measured performance 70 (3,920 ms total blocking, one 3,926 ms "Unattributable"
 * long task) and 99 and 100 on the two runs after it. So each page is requested once before it is
 * measured, and the middle of three runs is what has to clear 90.
 */
import { spawnSync } from "node:child_process";
import { get } from "node:http";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Categories the budget covers, and the floor each has to reach. */
export const BUDGET = { performance: 90, accessibility: 90, "best-practices": 90 };

/** Samples per page per run of the gate. */
export const SAMPLES = 3;

/**
 * The public pages. `{pactId}` is filled from the seeded database so the gate cannot audit an
 * empty or synthetic pact: the row it measures has to be one `migrations/seed.sql` wrote.
 */
export const TARGETS = [
  { name: "home", path: "/" },
  { name: "ledger", path: "/pacts" },
  { name: "verify", path: "/verify" },
  { name: "pact", path: "/pact/{pactId}", needsPactId: true },
];

/** Marks that only a development server emits; a production build must not show them. */
export const DEV_MARKERS = [/_next\/webpack-hmr/, /\/_next\/static\/chunks\/webpack\.js/];

export function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Scores for one category across the report objects of one page. */
export function scoresFor(reports, category) {
  return reports.map((r) => {
    const cat = r?.categories?.[category];
    if (!cat || typeof cat.score !== "number") {
      throw new Error(`report ${r?.finalDisplayedUrl ?? "?"} has no numeric score for ${category}`);
    }
    return Math.round(cat.score * 100);
  });
}

/**
 * What makes this a production build and not `next dev`: the dev-only requests. Returns the marker
 * that was found, or null when the page really was served by a production server.
 */
export function devMarker(report) {
  const urls = (report?.audits?.["network-requests"]?.details?.items ?? []).map((i) => String(i?.url ?? ""));
  const all = [...urls, String(report?.requestedUrl ?? ""), String(report?.finalDisplayedUrl ?? "")];
  return DEV_MARKERS.find((re) => all.some((u) => re.test(u))) ?? null;
}

/**
 * Judge one page. `reports` are the parsed Lighthouse JSON objects for that page.
 * Returns `{ failures, rows }` where failures is a list of human-readable strings.
 */
export function judgePage(target, reports, budget = BUDGET) {
  if (reports.length !== SAMPLES) {
    return {
      failures: [`${target.name}: expected ${SAMPLES} samples, found ${reports.length}`],
      rows: [],
    };
  }  const failures = [];
  const rows = [];
  for (const report of reports) {
    const marker = devMarker(report);
    if (marker) {
      failures.push(
        `${target.name}: the page was served by a development server (${String(marker)} appeared in its requests) — the budget is a production-build budget`
      );
      break;
    }
  }
  const formFactor = reports[0]?.configSettings?.formFactor;
  if (!failures.length && String(formFactor).toLowerCase() !== "mobile") {
    failures.push(`${target.name}: measured as "${formFactor}", the budget is a mobile budget`);
  }
  for (const [category, floor] of Object.entries(budget)) {
    let values;
    try {
      values = scoresFor(reports, category);
    } catch (e) {
      failures.push(`${target.name}: ${e.message}`);
      continue;
    }
    const mid = median(values);
    // One comparison decides both the row's verdict and whether the gate fails. They were written
    // separately before, and a median of exactly 90 then printed FAIL while exiting 0.
    const pass = mid >= floor;
    rows.push({ target: target.name, category, values, median: mid, floor, pass });
    if (!pass) {
      failures.push(
        `${target.name} · ${category}: median ${mid} is below the budget of ${floor} (samples ${values.join(", ")})`
      );
    }
  }
  return { failures, rows };
}

/** Markdown for the artifact: what was measured, on which URL, and what each sample scored. */
export function renderSummary(rows, urls, when) {
  const head = [
    `# Lighthouse budget — ${when}`,
    "",
    `Budget: ${Object.entries(BUDGET).map(([c, f]) => `${c} >= ${f}`).join(", ")} · mobile · median of ${SAMPLES} samples.`,
    "",
    "| Page | URL | Category | Samples | Median | Budget | Verdict |",
    "|---|---|---|---|---|---|---|",
  ];
  const body = rows.map(
    (r) =>
      `| ${r.target} | ${urls[r.target] ?? ""} | ${r.category} | ${r.values.join(", ")} | ${r.median} | ${r.floor} | ${
        r.pass ? "pass" : "**FAIL**"
      } |`
  );
  const failures = rows.filter((r) => !r.pass).length;
  return [...head, ...body, "", failures ? `${failures} row(s) below budget.` : "Every row at or above budget.", ""].join(
    "\n"
  );
}

export function parseArgs(argv) {
  const opts = {
    mode: null,
    baseUrl: "http://127.0.0.1:3000",
    reportsDir: null,
    pactId: null,
    lighthouseCli: process.env.LIGHTHOUSE_CLI ?? null,
    chromePath: process.env.CHROME_PATH ?? null,
    databaseUrl: process.env.DATABASE_URL ?? null,
    maxWaitForLoad: 45000,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      i += 1;
      return argv[i];
    };
    if (a === "--run") opts.mode = "run";
    else if (a === "--evaluate-only") opts.mode = "evaluate";
    else if (a === "--base-url") opts.baseUrl = next().replace(/\/$/, "");
    else if (a === "--reports-dir") opts.reportsDir = next();
    else if (a === "--pact-id") opts.pactId = next();
    else if (a === "--lighthouse-cli") opts.lighthouseCli = next();
    else if (a === "--chrome-path") opts.chromePath = next();
    else if (a === "--database-url") opts.databaseUrl = next();
    else if (a === "--max-wait-for-load") opts.maxWaitForLoad = Number(next());
    else throw new Error(`unknown argument ${a}`);
  }
  if (!opts.mode) throw new Error("pass --run or --evaluate-only");
  if (!opts.reportsDir) throw new Error("pass --reports-dir");
  return opts;
}

/**
 * A pact id that exists because the seed put it there. Reading it from the database rather than
 * hard-coding it is what makes "a production build with seeded data" checkable instead of intended:
 * if the seed did not run, or the indexer wrote nothing, the gate fails instead of auditing air.
 */
export async function seededPactId(databaseUrl) {
  const pgPath = resolve(import.meta.dirname ?? new URL(".", import.meta.url).pathname, "../apps/web/node_modules/pg/lib/index.js");
  if (!existsSync(pgPath)) throw new Error(`cannot find the pg driver at ${pgPath}`);
  // `pg/lib/index.js` is CommonJS with the driver on `module.exports`, so the named helper is not
  // always visible to the ESM loader; take the default export when that is the case (this is how
  // migrations/migrate.mjs reaches the same driver).
  const mod = await import(pathToFileURL(pgPath).href);
  const { Client } = mod.default ?? mod;
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const { rows } = await client.query(
      "select pact_id from pacts where state = 'settled' order by created_at limit 1"
    );
    if (rows.length === 0) throw new Error("the database holds no settled pact to audit — seed the database first");
    return String(rows[0].pact_id);
  } finally {
    await client.end();
  }
}

function targetUrl(opts, target, pactId) {
  const path = target.needsPactId ? target.path.replace("{pactId}", pactId) : target.path;
  return `${opts.baseUrl}${path}`;
}

export function lighthouseArgs(url, outPath, opts) {
  return [
    opts.lighthouseCli,
    url,
    "--output=json",
    `--output-path=${outPath}`,
    `--only-categories=${Object.keys(BUDGET).join(",")}`,
    "--form-factor=mobile",
    "--screenEmulation.mobile",
    "--throttling-method=simulate",
    `--max-wait-for-load=${opts.maxWaitForLoad}`,
    "--quiet",
    "--chrome-flags=--headless=new --no-sandbox --disable-dev-shm-usage",
  ];
}

/** One Lighthouse run for one page; non-zero exit is an error, not a "skip this page". */
function runLighthouse(url, outPath, opts) {
  const res = spawnSync(process.execPath, lighthouseArgs(url, outPath, opts), {
    stdio: ["ignore", "ignore", "pipe"],
    env: { ...process.env, CHROME_PATH: opts.chromePath },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.status !== 0) {
    throw new Error(`lighthouse failed for ${url} (exit ${res.status}): ${String(res.stderr).slice(0, 400)}`);
  }
}

/**
 * A page that answers anything but 200 is a broken deploy, and measuring it would be theatre.
 * `node:http` with `agent: false` rather than fetch: fetch keeps a pooled socket open after it,
 * which holds this process alive for seconds after the last measurement, and a gate that hangs
 * after it is finished is a gate that gets cancelled.
 */
export function assertServes(url) {
  return new Promise((done, failed) => {
    const req = get(url, { agent: false, headers: { connection: "close" } }, (res) => {
      res.resume();
      res.on("end", () => {
        if (res.statusCode !== 200) {
          failed(new Error(`${url} answered ${res.statusCode}, not 200 — the budget only applies to a page that loads`));
        } else {
          done();
        }
      });
    });
    req.setTimeout(20000, () => req.destroy(new Error(`${url} did not answer within 20 s`)));
    req.on("error", failed);
  });
}

/** The report files one page has, in sample order. Counted, not assumed: a truncated or an
 * over-long set is a finding about this run, and "found 2" says more than the path of whichever
 * file happened to be missing. `name` comes from TARGETS, never from input. */
export function listReports(dir, name) {
  const re = new RegExp(`^${name}\\.(\\d+)\\.json$`);
  return readdirSync(dir)
    .map((f) => ({ f, m: f.match(re) }))
    .filter((x) => x.m)
    .sort((a, b) => Number(a.m[1]) - Number(b.m[1]))
    .map((x) => resolve(dir, x.f));
}

export function readReports(dir, target) {
  return listReports(dir, target.name).map((file) => JSON.parse(readFileSync(file, "utf8")));
}

export async function main(argv) {
  const opts = parseArgs(argv);
  const dir = resolve(opts.reportsDir);
  mkdirSync(dir, { recursive: true });

  if (opts.mode === "run") {
    if (!opts.lighthouseCli) throw new Error("pass --lighthouse-cli (or set LIGHTHOUSE_CLI) to run measurements");
    if (!opts.chromePath) throw new Error("pass --chrome-path (or set CHROME_PATH) to run measurements");
    let pactId = opts.pactId;
    if (TARGETS.some((t) => t.needsPactId) && !pactId) {
      if (!opts.databaseUrl) throw new Error("pass --database-url so the pact page can be taken from the seeded ledger");
      pactId = await seededPactId(opts.databaseUrl);
      // Remember it, so the summary names the URL that was actually audited rather than the template.
      opts.pactId = pactId;
      process.stdout.write(`auditing the seeded pact ${pactId.slice(0, 12)}…\n`);
    }
    // Clear any earlier reports so a stale green can never stand in for this run's measurement.
    for (const target of TARGETS) for (const file of listReports(dir, target.name)) rmSync(file);
    for (const target of TARGETS) {
      const url = targetUrl(opts, target, pactId);
      await assertServes(url);
      for (let i = 1; i <= SAMPLES; i++) {
        process.stdout.write(`${target.name} sample ${i}/${SAMPLES}: ${url}\n`);
        runLighthouse(url, resolve(dir, `${target.name}.${i}.json`), opts);
      }
    }
  }

  const urls = {};
  const rows = [];
  const failures = [];
  for (const target of TARGETS) {
    urls[target.name] = targetUrl(opts, target, opts.pactId ?? "{pactId}");
    let reports;
    try {
      reports = readReports(dir, target);
    } catch (e) {
      failures.push(`${target.name}: ${e.message}`);
      continue;
    }
    const judged = judgePage(target, reports);
    rows.push(...judged.rows);
    failures.push(...judged.failures);
  }

  const summary = renderSummary(rows, urls, new Date().toISOString());
  writeFileSync(resolve(dir, "summary.md"), summary);
  writeFileSync(resolve(dir, "summary.json"), JSON.stringify({ rows, failures }, null, 2) + "\n");
  process.stdout.write(summary);

  if (failures.length) {
    for (const f of failures) process.stderr.write(`::error::${f}\n`);
    return 1;
  }
  process.stdout.write(`Lighthouse budget met on ${TARGETS.length} pages.\n`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      process.stderr.write(`lighthouse-budget: ${err.message}\n`);
      process.exitCode = 2;
    }
  );
}
