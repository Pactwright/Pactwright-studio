/**
 * #89: a Lighthouse budget on the public pages has to be able to say no.
 *
 * The gate lives in two places: `.github/workflows/lighthouse.yml` (what CI runs) and
 * `scripts/lighthouse-budget.mjs` (what decides pass or fail). Neither is checked by reading a
 * number off a dashboard, so this file runs the script against reports it writes itself, in a
 * temporary directory, and asserts on the exit code and the words it prints. The script is a `.mjs`
 * tool outside the app, so it is exercised as a subprocess rather than imported — which also proves
 * the command line CI passes is the one that works.
 */
import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

const SCRIPT = resolve(import.meta.dirname, "../../../../scripts/lighthouse-budget.mjs");
const WORKFLOW = readFileSync(resolve(import.meta.dirname, "../../../../.github/workflows/lighthouse.yml"), "utf8");
const TARGET_NAMES = ["home", "ledger", "verify", "pact"];
type Scores = { performance: number; accessibility: number; "best-practices": number };
type Extra = { formFactor?: string; devRequests?: boolean };

/** One parsed Lighthouse report, reduced to the fields the budget reads. */
function report(scores: Scores, extra: Extra = {}): Record<string, unknown> {
  return {
    requestedUrl: "http://127.0.0.1:3000/",
    finalDisplayedUrl: "http://127.0.0.1:3000/",
    configSettings: { formFactor: extra.formFactor ?? "mobile" },
    categories: Object.fromEntries(Object.entries(scores).map(([c, s]) => [c, { score: s / 100 }])),
    audits: {
      "network-requests": {
        details: {
          items: [
            { url: "http://127.0.0.1:3000/" },
            { url: "http://127.0.0.1:3000/_next/static/chunks/3aj1da3xp8f-0.css" },
            ...(extra.devRequests ? [{ url: "http://127.0.0.1:3000/_next/webpack-hmr" }] : []),
          ],
        },
      },
    },
  };
}

const ok = (): Scores => ({ performance: 99, accessibility: 100, "best-practices": 96 });
const passing = (n = 3): Record<string, unknown>[] => Array.from({ length: n }, () => report(ok()));

/** Three samples of one page with one category replaced. */
function degraded(category: keyof Scores, score: number): Record<string, unknown>[] {
  return Array.from({ length: 3 }, () => report({ ...ok(), [category]: score }));
}

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

/** Write `<target>.<sample>.json` into a fresh temp dir and return it. */
function reportsDir(spec: Record<string, Record<string, unknown>[]>): string {
  const dir = mkdtempSync(join(tmpdir(), "lh-budget-"));
  dirs.push(dir);
  for (const [target, reports] of Object.entries(spec)) {
    reports.forEach((r, i) => writeFileSync(join(dir, `${target}.${i + 1}.json`), JSON.stringify(r)));
  }
  return dir;
}

function evaluate(spec: Record<string, Record<string, unknown>[]>) {
  const dir = reportsDir(spec);
  const res = spawnSync(process.execPath, [SCRIPT, "--evaluate-only", "--reports-dir", dir], { encoding: "utf8" });
  return { dir, code: res.status, out: res.stdout, err: res.stderr };
}

/** The same passing reports for every page, then override some of them. */
function pages(over: Record<string, Record<string, unknown>[]> = {}) {
  return { ...Object.fromEntries(TARGET_NAMES.map((n) => [n, passing()])), ...over } as Record<
    string,
    Record<string, unknown>[]
  >;
}

describe("#89 the budget gate judges what it is given", () => {
  it("passes when every page clears 90 in all three categories", () => {
    const { code, out } = evaluate(pages());
    expect(out).not.toMatch(/FAIL/);
    expect(code).toBe(0);
    expect(out).toContain("Every row at or above budget.");
    expect(out).toContain("Lighthouse budget met on 4 pages.");
    const rows = out.split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| Page") && !l.startsWith("|---"));
    expect(rows.length).toBe(12);
  });

  it("takes the median of three samples, so one cold run cannot fail the gate", () => {
    // The numbers come from the reports this gate wrote locally: the first sample of a fresh
    // `next start` process scored home 76 (1,263 ms total blocking, 1,285 ms max potential FID) and
    // the two after it scored 99 (145 ms and 100 ms), with the document answered in 10-20 ms.
    const cold = [report({ ...ok(), performance: 76 }), ...passing(2)];
    const { code, out } = evaluate(pages({ home: cold }));
    expect(out).toContain("home | http://127.0.0.1:3000/ | performance | 76, 99, 99 | 99 | 90 | pass");
    expect(code).toBe(0);
  });

  it("holds 90 as the floor, inclusive", () => {
    const floor = Array.from({ length: 3 }, () => report({ performance: 90, accessibility: 90, "best-practices": 90 }));
    expect(evaluate(pages({ home: floor })).code).toBe(0);
  });

  it("fails a page whose median performance is 89 and names the page, the category and the samples", () => {
    const slow = [
      report({ ...ok(), performance: 88 }),
      report({ ...ok(), performance: 89 }),
      report({ ...ok(), performance: 90 }),
    ];
    const { code, err, out } = evaluate(pages({ ledger: slow }));
    expect(out).toContain("**FAIL**");
    expect(code).toBe(1);
    expect(err).toContain("::error::ledger · performance: median 89 is below the budget of 90 (samples 88, 89, 90)");
  });

  it("gates accessibility and best practices at the same floor, not performance alone", () => {
    const a11y = evaluate(pages({ verify: degraded("accessibility", 84) }));
    expect(a11y.code).toBe(1);
    expect(a11y.err).toContain("::error::verify · accessibility: median 84 is below the budget of 90");

    const bp = evaluate(pages({ pact: degraded("best-practices", 89) }));
    expect(bp.code).toBe(1);
    expect(bp.err).toContain("::error::pact · best-practices: median 89 is below the budget of 90");
  });

  it("refuses to grade a development server", () => {
    const dev = Array.from({ length: 3 }, () => report(ok(), { devRequests: true }));
    const { code, err } = evaluate(pages({ home: dev }));
    expect(code).toBe(1);
    expect(err).toContain("served by a development server");
    expect(err).toContain("the budget is a production-build budget");
  });

  it("refuses to grade a desktop run as the mobile budget", () => {
    const desktop = Array.from({ length: 3 }, () => report(ok(), { formFactor: "desktop" }));
    const { code, err } = evaluate(pages({ ledger: desktop }));
    expect(code).toBe(1);
    expect(err).toContain('ledger: measured as "desktop", the budget is a mobile budget');
  });

  it("counts the samples instead of trusting the directory it was given", () => {
    const { code, err } = evaluate(pages({ verify: passing(2) }));
    expect(code).toBe(1);
    expect(err).toContain("verify: expected 3 samples, found 2");
  });

  it("counts too many samples as well, so an old run cannot be padded into the middle", () => {
    const { code, err } = evaluate(pages({ home: passing(4) }));
    expect(code).toBe(1);
    expect(err).toContain("home: expected 3 samples, found 4");
  });

  it("fails when the reports are not there at all, rather than reporting a green nothing", () => {
    const { code, err } = evaluate({});
    expect(code).toBe(1);
    for (const name of TARGET_NAMES) expect(err).toContain(`${name}: expected 3 samples, found 0`);
  });

  it("treats a category with no score as a failure, not as a zero that rounds away", () => {
    const unscored = Array.from({ length: 3 }, () => {
      const r = report(ok());
      (r.categories as Record<string, { score: number | null }>).performance.score = null;
      return r;
    });
    const { code, err } = evaluate(pages({ pact: unscored }));
    expect(code).toBe(1);
    expect(err).toContain("pact: report http://127.0.0.1:3000/ has no numeric score for performance");
  });

  it("writes the summary the artifact is made of", () => {
    const { dir, code } = evaluate(pages());
    expect(code).toBe(0);
    const md = readFileSync(join(dir, "summary.md"), "utf8");
    const json = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8")) as { rows: unknown[]; failures: string[] };
    expect(md).toContain("| Page | URL | Category | Samples | Median | Budget | Verdict |");
    expect(md).toContain("median of 3 samples");
    expect(json.rows.length).toBe(12);
    expect(json.failures).toEqual([]);
  });

  it("writes the failing row into summary.md too, so the artifact explains the red", () => {
    const { dir } = evaluate(pages({ home: degraded("performance", 41) }));
    const md = readFileSync(join(dir, "summary.md"), "utf8");
    expect(md).toContain("| home | http://127.0.0.1:3000/ | performance | 41, 41, 41 | 41 | 90 | **FAIL** |");
    expect(md).toContain("1 row(s) below budget.");
  });

  it("audits the public pages, and no signed-in one", () => {
    const { out, err } = evaluate(pages());
    const all = out + err;
    expect(all).toContain("http://127.0.0.1:3000/ | performance");
    expect(all).toContain("http://127.0.0.1:3000/pacts");
    expect(all).toContain("http://127.0.0.1:3000/verify");
    expect(all).toContain("http://127.0.0.1:3000/pact/{pactId}");
    expect(all).not.toMatch(/\/merchant|\/principal/);
  });
});

describe("#89 the workflow that runs the gate", () => {
  /** The body of the `run: |` block of the step whose name matches. */
  function runBlock(name: RegExp): string {
    const step = WORKFLOW.split("\n      - ").find((s) => name.test(s));
    if (!step) throw new Error(`no step matching ${name}`);
    const start = step.indexOf("run: |");
    if (start < 0) return "";
    return step
      .slice(start)
      .split("\n")
      .slice(1)
      .filter((l) => l.startsWith("          ") || l.trim() === "")
      .join("\n");
  }

  it("measures a production build of a seeded database", () => {
    expect(WORKFLOW).toContain("pnpm build");
    expect(WORKFLOW).toMatch(/pnpm --filter web start/);
    expect(WORKFLOW).not.toMatch(/next dev|web dev\b/);
    expect(WORKFLOW).toContain("pnpm db:seed");
    expect(runBlock(/Budget gate/)).toContain("--database-url");
  });

  it("runs the script in measure mode", () => {
    const block = runBlock(/Budget gate/);
    expect(block).toContain("--run");
    expect(block).toContain("scripts/lighthouse-budget.mjs");
    expect(block).toContain("--reports-dir");
    expect(block).toContain("--lighthouse-cli");
  });

  it("uploads the report as an artifact even when the gate is red", () => {
    expect(WORKFLOW).toMatch(/if: always\(\)/);
    expect(WORKFLOW).toContain("uses: actions/upload-artifact@");
    expect(WORKFLOW).toMatch(/name: lighthouse-reports/);
    expect(WORKFLOW).toMatch(/if-no-files-found: error/);
  });

  it("cannot be silenced from inside the job", () => {
    expect(WORKFLOW).not.toMatch(/continue-on-error/);
    expect(WORKFLOW).not.toMatch(/\|\|\s*true/);
    expect(runBlock(/Budget gate/)).not.toMatch(/exit 0/);
  });

  it("keeps every ${{ }} out of the shell, so event data cannot be injected", () => {
    for (const step of WORKFLOW.split("\n      - ")) {
      const start = step.indexOf("run: |");
      if (start >= 0) expect(step.slice(start)).not.toMatch(/\$\{\{/);
    }
    // The two scratch paths are exported by a step from RUNNER_TEMP rather than written as
    // expressions, and the artifact upload points at the same directory through `with:`, where the
    // `runner` context is legal.
    expect(WORKFLOW).toMatch(/LH_REPORTS=\$RUNNER_TEMP\/lighthouse-reports/);
    expect(WORKFLOW).toMatch(/LH_PREFIX=\$RUNNER_TEMP\/lighthouse-tool/);
    expect(WORKFLOW).toMatch(/path: \$\{\{ runner\.temp \}\}\/lighthouse-reports/);
  });

  /**
   * A `${{ }}` GitHub cannot evaluate in the place it sits is not a step that fails: it is a file
   * that does not parse, so no job, no check and no report ever appear. `runner` is one of the
   * contexts missing from a job-level `env:` block, which is how this job lost 13 minutes to a red
   * run with zero jobs. Step-level `env:`/`with:` do allow it, so only the outer blocks are read.
   */
  it("keeps expressions out of the env blocks GitHub will not parse", () => {
    const lines = WORKFLOW.split("\n");
    const outer: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^(\s*)env:\s*$/);
      if (!m || m[1].length > 4) continue;
      const indent = m[1].length;
      let j = i + 1;
      while (j < lines.length) {
        const lead = lines[j].match(/^(\s*)/)![1].length;
        if (lines[j].trim() === "" || lead <= indent) break;
        j++;
      }
      outer.push(lines.slice(i + 1, j).join("\n"));
    }
    expect(outer.length).toBeGreaterThan(0);
    for (const block of outer) expect(block).not.toMatch(/\$\{\{/);
  });

  it("pins what it downloads", () => {
    expect(WORKFLOW).toMatch(/LH_VERSION: \d+\.\d+\.\d+/);
    expect(WORKFLOW).toContain("--ignore-scripts");
    expect(WORKFLOW).toContain("--no-save");
    for (const uses of WORKFLOW.match(/uses: [^\n]+/g) ?? []) expect(uses).toMatch(/@[0-9a-f]{40}/);
    expect(runBlock(/Install Lighthouse/)).toMatch(/test "\$INSTALLED" = "\$LH_VERSION"/);
  });

  it("keeps the budget in one place, and the four pages with it", () => {
    const script = readFileSync(SCRIPT, "utf8");
    expect(script).toMatch(/performance: 90, accessibility: 90, "best-practices": 90/);
    expect(script).toMatch(/export const SAMPLES = 3;/);
    expect(script).toMatch(/path: "\/"/);
    expect(script).toMatch(/path: "\/pacts"/);
    expect(script).toMatch(/path: "\/verify"/);
    expect(script).toMatch(/\{pactId\}/);
  });

  it("adds no dependency to the project", () => {
    for (const rel of ["../../../../package.json", "../../package.json"]) {
      const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, rel), "utf8")) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
      expect(Object.keys(deps)).not.toContain("lighthouse");
      expect(Object.keys(deps)).not.toContain("@lhci/cli");
    }
  });
});

describe("#89 run mode, without a browser", () => {
  /** A stand-in for the Lighthouse CLI: it writes a report where it was told to and exits. */
  function fakeLighthouse(dir: string, scores: Scores, exitCode = 0): string {
    const file = join(dir, "fake-lighthouse.mjs");
    writeFileSync(
      file,
      `import { writeFileSync } from "node:fs";
const args = process.argv.slice(2);
const out = args.find((a) => a.startsWith("--output-path=")).slice("--output-path=".length);
const url = args.find((a) => !a.startsWith("--") && !a.endsWith(".js"));
writeFileSync(out, JSON.stringify({
  requestedUrl: url, finalDisplayedUrl: url,
  configSettings: { formFactor: "mobile" },
  categories: ${JSON.stringify(Object.fromEntries(Object.entries(scores).map(([c, s]) => [c, { score: s / 100 }])))},
  audits: { "network-requests": { details: { items: [{ url }] } } },
}));
process.exit(${exitCode});
`
    );
    return file;
  }

  /** A server that answers whatever the pages are, and records what it was asked for. */
  async function serving(status = 200) {
    const seen: string[] = [];
    const server = createServer((req, res) => {
      seen.push(req.url ?? "");
      res.writeHead(status, { "content-type": "text/html" });
      res.end("<html><body>studio</body></html>");
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address() as AddressInfo;
    servers.push(server);
    return { url: `http://127.0.0.1:${address.port}`, seen };
  }

  const servers: Server[] = [];
  afterAll(async () => {
    for (const s of servers) await new Promise((done) => s.close(done));
  });

  async function runMode(opts: { scores?: Scores; exitCode?: number; status?: number }) {
    const work = mkdtempSync(join(tmpdir(), "lh-run-"));
    dirs.push(work);
    const reports = join(work, "reports");
    const { url: baseUrl, seen } = await serving(opts.status ?? 200);
    const args = [
      SCRIPT,
      "--run",
      "--base-url",
      baseUrl,
      "--reports-dir",
      reports,
      "--lighthouse-cli",
      fakeLighthouse(work, opts.scores ?? ok(), opts.exitCode ?? 0),
      "--chrome-path",
      process.execPath,
      "--pact-id",
      "f".repeat(64),
    ];
    // Asynchronous on purpose: `spawnSync` would block this process, and the pages the child asks
    // for are served by this process.
    try {
      const r = await execFileAsync(process.execPath, args, { maxBuffer: 32 * 1024 * 1024 });
      return { reports, code: 0, out: r.stdout, err: r.stderr, seen };
    } catch (e) {
      const f = e as { code?: number | string; stdout?: string; stderr?: string };
      return { reports, code: typeof f.code === "number" ? f.code : 1, out: f.stdout ?? "", err: f.stderr ?? "", seen };
    }
  }

  it("measures every page three times and then judges what it collected", async () => {
    const { reports, code, out, seen } = await runMode({});
    expect(out).toContain("sample 3/3");
    const measured = readdirSync(reports).filter((f) => /^\w+\.\d+\.json$/.test(f));
    expect(measured.length).toBe(12);
    expect(new Set(measured.map((f) => f.split(".")[0]))).toEqual(new Set(TARGET_NAMES));
    expect(code).toBe(0);
    expect(out).toContain("Lighthouse budget met on 4 pages.");
    // The pact page is asked for by the id it was given, not by the template it was written with.
    expect(seen).toContain("/pact/" + "f".repeat(64));
    expect(seen).not.toContain("/pact/{pactId}");
  });

  it("fails the run when a page does not answer 200, instead of scoring the error page", async () => {
    const { code, err, out } = await runMode({ status: 500 });
    expect(code).toBe(2);
    expect(out + err).toMatch(/answered 500, not 200/);
  });

  it("fails the run when a measurement crashes, instead of judging the pages that survived", async () => {
    const { code, err, out } = await runMode({ exitCode: 3 });
    expect(code).toBe(2);
    expect(out + err).toMatch(/lighthouse failed for/);
  });

  it("judges the measurements it just took, so a red page cannot hide behind run mode", async () => {
    const { code, err, out } = await runMode({ scores: { performance: 51, accessibility: 100, "best-practices": 96 } });
    expect(code).toBe(1);
    expect(out + err).toMatch(/performance: median 51 is below the budget of 90/);
  });
});
