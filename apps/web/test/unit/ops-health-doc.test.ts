/**
 * #91: README's field-by-field description of `/api/ops/health` is checked against the probes that
 * produce it. Each documented row is re-derived from `lib/ops/monitoring.ts` — its default
 * threshold, the side of that threshold it fails on, the variable that overrides it and where the
 * reading comes from — so the document cannot drift from the code without failing here.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  MAX_LAG_LEDGERS_FROM_CADENCE,
  MEASURED_MAX_SYNC_GAP_SECONDS,
  SECONDS_PER_LEDGER,
  evaluateSystemHealth,
  probeAnchorVerification,
  probeIndexerLag,
  probePendingCertificates,
  probeSponsorBalance,
  probeVerifierErrorRate,
  type ProbeResult,
} from "@/lib/ops/monitoring";
import { DEFAULT_RPC_RETENTION } from "@/lib/indexer/backfill";

const HERE = dirname(fileURLToPath(import.meta.url));
const README = readFileSync(join(HERE, "../../../../README.md"), "utf8");
const MONITORING_SRC = readFileSync(join(HERE, "../../lib/ops/monitoring.ts"), "utf8");
const ROUTE_SRC = readFileSync(join(HERE, "../../app/api/ops/health/route.ts"), "utf8");

/** The retention window the deployed testnet reports; the cadence threshold binds inside it. */
const TESTNET_RETENTION = 120960;

const ENV_KEYS = [
  "PROBE_MIN_SPONSOR_BALANCE_XLM",
  "PROBE_MAX_INDEXER_LAG_LEDGERS",
  "PROBE_MAX_INDEXER_LAG_SECONDS",
  "PROBE_MAX_PENDING_CERTIFICATES",
  "PROBE_MAX_VERIFIER_ERROR_RATE",
  "ANCHOR_MAX_BATCH_SIZE",
] as const;

const savedEnv: Record<string, string | undefined> = {};
for (const key of ENV_KEYS) {
  savedEnv[key] = process.env[key];
  delete process.env[key];
}

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

/** A recorded post-anchor failure, shaped as `lib/anchorer` stores it. */
const anchorFailure = { batchId: 7, leaf: "a".repeat(64), reason: "verify_receipt returned false", at: new Date(0) };

/** How each probe is called to report its thresholds, with nothing overridden. */
const CALLS: Record<string, () => ProbeResult> = {
  sponsor_balance: () => probeSponsorBalance(0),
  indexer_lag: () => probeIndexerLag(0, TESTNET_RETENTION),
  pending_certificates: () => probePendingCertificates(0),
  verifier_error_rate: () => probeVerifierErrorRate(0, 0),
  anchor_verification: () => probeAnchorVerification(anchorFailure),
};

/** Split a markdown table row into trimmed cells. */
function cells(line: string): string[] {
  return line.split("|").slice(1, -1).map((c) => c.trim());
}

/** The rows of the table whose header is exactly `header`, keyed by header cell. */
function table(header: string): Record<string, string>[] {
  const lines = README.split("\n");
  const start = lines.findIndex((l) => cells(l).join(" | ") === header);
  if (start === -1) throw new Error(`README has no table with header: ${header}`);
  const headings = cells(lines[start]);
  const rows: Record<string, string>[] = [];
  for (const line of lines.slice(start + 2)) {
    if (!line.startsWith("|")) break;
    const row = cells(line);
    rows.push(Object.fromEntries(headings.map((h, i) => [h, row[i] ?? ""])));
  }
  return rows;
}

/** The probe table, keyed by probe name. */
function probeRows(): Record<string, Record<string, string>> {
  return Object.fromEntries(
    table("Probe | `value` is | Default threshold | Fails when | Override").map((r) => [
      r["Probe"].replace(/`/g, ""),
      r,
    ]),
  );
}

/** Field names of an interface, read out of the source that declares it. */
function interfaceFields(src: string, name: string): string[] {
  const body = src.match(new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`));
  if (!body) throw new Error(`no interface ${name}`);
  return [...body[1].matchAll(/^\s*(\w+)\??:/gm)].map((m) => m[1]);
}

/** The threshold a probe reports, as a number — measured probes always report one. */
function thresholdOf(call: () => ProbeResult): number {
  const t = call().threshold;
  if (t === undefined) throw new Error("probe reported no threshold");
  return t;
}

/** Ledgers as hours to one decimal — the conversion the alert text is written in. */
const toHours = (ledgers: number) => Math.round((ledgers * SECONDS_PER_LEDGER * 10) / 3600) / 10;

describe("#91 README documents every field of /api/ops/health", () => {
  it("documents exactly the probes the code can produce, and no others", () => {
    const documented = Object.keys(probeRows());
    expect(documented.sort()).toEqual(Object.keys(CALLS).sort());
    expect(documented.sort()).toEqual(Object.values(CALLS).map((call) => call().name).sort());

    // A report with everything measured holds nothing the table does not name.
    const report = evaluateSystemHealth(
      {
        sponsorBalanceXlm: 500,
        indexerLagLedgers: 1,
        rpcRetentionLedgers: TESTNET_RETENTION,
        pendingCertificatesCount: 0,
        verifierTotalRequests: 10,
        verifierErrorRequests: 0,
      },
      [],
    );
    for (const probe of report.probes) expect(documented).toContain(probe.name);
  });

  it("documents every field a probe answers, and every key of metrics", () => {
    const fieldRows = table("Probe field | Meaning").map((r) => r["Probe field"].replace(/`/g, ""));
    expect(fieldRows.sort()).toEqual(interfaceFields(MONITORING_SRC, "ProbeResult").sort());

    // The four fields of the response itself, named by the route that returns them.
    const responseRows = table("Field | Contents").map((r) => r.Field.replace(/`/g, ""));
    expect(responseRows.sort()).toEqual(["alerts", "healthy", "metrics", "probes"]);

    for (const key of interfaceFields(MONITORING_SRC, "SystemMetrics")) {
      expect(README).toContain(`\`${key}\``);
    }
    for (const key of ["healthy", "probes", "alerts", "metrics"]) {
      expect(ROUTE_SRC).toContain(key);
    }
  });

  it("states each probe's default threshold as the number the probe applies", () => {
    const rows = probeRows();
    expect(rows.sponsor_balance["Default threshold"]).toContain(String(thresholdOf(CALLS.sponsor_balance)));
    expect(rows.pending_certificates["Default threshold"]).toContain(String(thresholdOf(CALLS.pending_certificates)));
    expect(rows.verifier_error_rate["Default threshold"]).toContain(String(thresholdOf(CALLS.verifier_error_rate)));
    expect(rows.anchor_verification["Default threshold"]).toContain(String(thresholdOf(CALLS.anchor_verification)));

    // Lag is the threshold with two sources: the cadence, and half of retention — the smaller wins.
    const cadence = thresholdOf(CALLS.indexer_lag);
    expect(cadence).toBe(MAX_LAG_LEDGERS_FROM_CADENCE);
    expect(rows.indexer_lag["Default threshold"]).toContain(String(cadence));
    expect(rows.indexer_lag["Default threshold"]).toContain(`~${toHours(cadence)} h`);
    const retentionHalf = Math.floor(DEFAULT_RPC_RETENTION * 0.5);
    expect(probeIndexerLag(0, DEFAULT_RPC_RETENTION).threshold).toBe(retentionHalf);
    expect(probeIndexerLag(0, DEFAULT_RPC_RETENTION).configSource).toBe(`default:50%retention(${retentionHalf})`);
    expect(rows.indexer_lag["Default threshold"]).toContain(String(retentionHalf));
    expect(rows.indexer_lag["Default threshold"]).toContain(`~${toHours(retentionHalf)} h`);

    // And the cadence number comes from the gap that actually runs, at the measured ledger rate.
    expect(MAX_LAG_LEDGERS_FROM_CADENCE).toBe(Math.ceil((2 * MEASURED_MAX_SYNC_GAP_SECONDS) / SECONDS_PER_LEDGER));
    expect(rows.indexer_lag["Default threshold"]).toContain("twice the worst sync gap");
    expect(rows.indexer_lag["Default threshold"]).toContain("50% of RPC retention");
    expect(rows.indexer_lag["Default threshold"]).toContain(`${SECONDS_PER_LEDGER} s/ledger`);
  });

  it("states the side of the threshold each probe fails on, by testing the boundary", () => {
    const rows = probeRows();
    const balance = thresholdOf(CALLS.sponsor_balance);
    expect(probeSponsorBalance(balance).ok).toBe(true);
    expect(probeSponsorBalance(balance - 1).ok).toBe(false);
    expect(rows.sponsor_balance["Fails when"]).toBe("below it");

    const lag = MAX_LAG_LEDGERS_FROM_CADENCE;
    expect(probeIndexerLag(lag - 1, TESTNET_RETENTION).ok).toBe(true);
    expect(probeIndexerLag(lag, TESTNET_RETENTION).ok).toBe(false);
    expect(rows.indexer_lag["Fails when"]).toBe("at or above it");

    const pending = thresholdOf(CALLS.pending_certificates);
    expect(probePendingCertificates(pending).ok).toBe(true);
    expect(probePendingCertificates(pending + 1).ok).toBe(false);
    expect(rows.pending_certificates["Fails when"]).toContain("above it");

    const rate = thresholdOf(CALLS.verifier_error_rate);
    expect(probeVerifierErrorRate(1000, Math.round(rate * 1000)).ok).toBe(true);
    expect(probeVerifierErrorRate(1000, Math.round(rate * 1000) + 1).ok).toBe(false);
    expect(rows.verifier_error_rate["Fails when"]).toContain("above it");

    // A verifier that has served nothing is a pass at 0, not a division by zero.
    const idle = probeVerifierErrorRate(0, 0);
    expect(idle.ok).toBe(true);
    expect(idle.value).toBe(0);
    expect(rows.verifier_error_rate["Fails when"]).toContain("zero requests");

    expect(probeAnchorVerification(anchorFailure).ok).toBe(false);
    expect(rows.anchor_verification["Fails when"]).toBe("a failure is on record");
  });

  it("names the override each probe reads, and only the probe that reads it", () => {
    const rows = probeRows();
    const overrides: [string, (typeof ENV_KEYS)[number], string, number][] = [
      ["sponsor_balance", "PROBE_MIN_SPONSOR_BALANCE_XLM", "4", 4],
      ["indexer_lag", "PROBE_MAX_INDEXER_LAG_LEDGERS", "40", 40],
      ["pending_certificates", "PROBE_MAX_PENDING_CERTIFICATES", "40", 40],
      ["verifier_error_rate", "PROBE_MAX_VERIFIER_ERROR_RATE", "0.4", 0.4],
    ];
    for (const [name, key, value, expectedThreshold] of overrides) {
      expect(rows[name].Override).toContain(key);
      expect(README).toContain(`\`${key}\``); // the configuration table names it too
      process.env[key] = value;
      const probe = CALLS[name]();
      expect(probe.configSource).toContain(`env:${key}`);
      expect(thresholdOf(CALLS[name])).toBeCloseTo(expectedThreshold, 5);
      delete process.env[key];
    }

    // The seconds ceiling is a second check on the same probe, and it does not move the ledger number.
    expect(rows.indexer_lag.Override).toContain("PROBE_MAX_INDEXER_LAG_SECONDS");
    expect(CALLS.indexer_lag().configSource).not.toContain("SECONDS");
    process.env.PROBE_MAX_INDEXER_LAG_SECONDS = "40";
    const capped = CALLS.indexer_lag();
    expect(capped.configSource).toBe("env:PROBE_MAX_INDEXER_LAG_SECONDS(40s)");
    expect(thresholdOf(() => capped)).toBe(MAX_LAG_LEDGERS_FROM_CADENCE);
    // 9 ledgers (45 s) clears the ledger threshold and breaks the wall-clock one.
    expect(probeIndexerLag(9, TESTNET_RETENTION, undefined, 9 * SECONDS_PER_LEDGER).ok).toBe(false);
    expect(probeIndexerLag(7, TESTNET_RETENTION, undefined, 7 * SECONDS_PER_LEDGER).ok).toBe(true);
    delete process.env.PROBE_MAX_INDEXER_LAG_SECONDS;

    // Every PROBE_* variable the code reads is documented against the probe that reads it.
    const readInCode = [...new Set([...MONITORING_SRC.matchAll(/process\.env\.(PROBE_[A-Z_]+)/g)].map((m) => m[1]))].sort();
    expect(readInCode).toEqual(
      [...overrides.map(([, key]) => String(key)), "PROBE_MAX_INDEXER_LAG_SECONDS"].sort(),
    );

    // The backlog threshold follows the batch size it is derived from, as the row says.
    process.env.ANCHOR_MAX_BATCH_SIZE = "1000";
    const derived = probePendingCertificates(0);
    expect(thresholdOf(() => derived)).toBe(2000);
    expect(derived.configSource).toBe("derived:ANCHOR_MAX_BATCH_SIZE*2");
    expect(rows.pending_certificates["Default threshold"]).toContain("2 × `ANCHOR_MAX_BATCH_SIZE`");
    delete process.env.ANCHOR_MAX_BATCH_SIZE;

    // Nothing tunes the on-chain probe.
    const onChain = CALLS.anchor_verification().configSource;
    for (const [, key, value] of overrides) process.env[key] = value;
    expect(probeAnchorVerification(anchorFailure).configSource).toBe(onChain);
    expect(rows.anchor_verification.Override).toContain("none");
  });

  it("keeps the configuration table and the probe table saying the same thing", () => {
    const configRows = new Map(table("Variable | Purpose").map((r) => [r.Variable.replace(/`/g, ""), r.Purpose]));
    const rows = probeRows();
    // Which probe each documented override belongs to, from the probe table itself.
    const varToRow = new Map<string, string>();
    for (const [name, row] of Object.entries(rows)) {
      for (const m of row.Override.matchAll(/[A-Z][A-Z_]{6,}/g)) varToRow.set(m[0], name);
    }
    expect([...varToRow.keys()].sort()).toEqual(
      ["PROBE_MIN_SPONSOR_BALANCE_XLM", "PROBE_MAX_INDEXER_LAG_LEDGERS", "PROBE_MAX_INDEXER_LAG_SECONDS",
       "PROBE_MAX_PENDING_CERTIFICATES", "PROBE_MAX_VERIFIER_ERROR_RATE"].sort(),
    );

    for (const [varName, rowName] of varToRow) {
      const purpose = configRows.get(varName);
      expect(purpose, `${varName} is not in the configuration table`).toBeDefined();
      // A number in that row is a claim about the threshold, so the probe row must say the same one.
      for (const m of purpose!.matchAll(/\d+(?:\.\d+)?/g)) {
        expect(rows[rowName]["Default threshold"] + rows[rowName].Override,
          `${varName} row claims ${m[0]}, the ${rowName} row does not`).toContain(m[0]);
      }
    }
  });

  it("explains the 503 rule: an unmeasured signal is an alert, never a pass", () => {
    const report = evaluateSystemHealth({}, [{ name: "verifier_error_rate", reason: "VERIFIER_URL is not set" }]);
    const [probe] = report.probes;
    expect(report.healthy).toBe(false);
    expect(probe.ok).toBe(false);
    expect(probe.value).toBeUndefined(); // a number nobody read is not reported as one
    expect(probe.configSource).toBe("unmeasured");
    expect(probe.alert).toContain("could not be measured (VERIFIER_URL is not set)");
    expect(report.alerts).toEqual([probe.alert]);

    expect(README).toMatch(/a probe that cannot be measured is an alert, never a pass/i);
    expect(README).toContain('`configSource: "unmeasured"`');
    expect(README).toContain("no `value`");
    expect(README).toContain("could not be measured (VERIFIER_URL is not set)");
    expect(README).toContain("`probes: []`");
    expect(ROUTE_SRC).toContain("report.healthy ? 200 : 503");
    expect(ROUTE_SRC).toContain("probes: []");
    expect(ROUTE_SRC).toContain("health could not be measured");

    // The one probe absent while everything is fine, which the document calls out.
    const clean = evaluateSystemHealth({ sponsorBalanceXlm: 500, indexerLagLedgers: 1, pendingCertificatesCount: 0 }, []);
    expect(clean.probes.map((p) => p.name)).not.toContain("anchor_verification");
    expect(clean.healthy).toBe(true);
    expect(README).toContain("it is only listed when a post-anchor failure has actually been recorded");
  });

  it("drops the claims that stopped being true", () => {
    expect(README).not.toContain("Alert at 50% of RPC retention |");
    expect(README).not.toContain("aren't yet");
    expect(README).not.toContain("(default: 300)");
    expect(README).not.toContain("default: 500 or 2x batch size");
    expect(README).not.toContain("all four XC-03 signals");
    expect(README).not.toContain("Ops health probes | 🚧 Partial");
  });

  it("points the route table and the feature table at the section", () => {
    expect(README).toContain("### Ops health");
    expect(README).toContain("[Ops health](#ops-health)");
    const routeRow = table("Route | Kind | Purpose").find((r) => r.Route === "`GET /api/ops/health`");
    expect(routeRow?.Purpose).toContain("[Ops health](#ops-health)");
  });

  it("names the sources each reading comes from", () => {
    const rows = probeRows();
    // Every unit column says what the code reads, and the reading is described where it happens.
    expect(rows.sponsor_balance["`value` is"]).toContain("XLM");
    expect(rows.indexer_lag["`value` is"]).toContain("ledgers");
    expect(rows.pending_certificates["`value` is"]).toContain("batch_id");
    expect(rows.verifier_error_rate["`value` is"]).toContain("fraction");
    expect(rows.anchor_verification["`value` is"]).toMatch(/1 .*0|0 .*1/);
    for (const phrase of ["`SPONSOR_ACCOUNT`", "getHealth", "VERIFIER_URL", "ReceiptAnchor.verify_receipt"]) {
      expect(README).toContain(phrase);
    }
  });
});
