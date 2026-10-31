/**
 * Measures the four XC-03 signals for `/api/ops/health`: lag from the slowest cursor to the RPC's
 * latest ledger, RPC retention, receipts still waiting for a batch, the XLM the sponsor account
 * holds to pay ledger fees, and the verifier's own verdict counters. ROADMAP XC-03, S-10.
 */
import { anchorerKey } from "@/lib/anchorer";
import { chainConfig, server, type ChainConfig } from "@/lib/chain";
import { db } from "@/lib/db";
import { stroopsToDecimal } from "@/lib/indexer";
import { getCursor } from "@/lib/indexer/cursor";
import { sources } from "@/lib/indexer/sources";
import type { SystemMetrics, UnmeasuredSignal } from "./monitoring";

export interface IndexerHealthDeps {
  /** The RPC's latest and oldest retained ledgers. */
  ledgers: () => Promise<{ latestLedger: number; oldestLedger: number }>;
  /** Each source's cursor; 0 means the source was never synced. */
  cursors: () => Promise<number[]>;
  pendingReceipts: () => Promise<number>;
  /** Where a never-synced source starts (INDEX_START_LEDGER). */
  startLedger?: number;
}

export async function measureIndexerHealth(deps: IndexerHealthDeps): Promise<SystemMetrics> {
  const [{ latestLedger, oldestLedger }, cursors, pendingCertificatesCount] = await Promise.all([
    deps.ledgers(),
    deps.cursors(),
    deps.pendingReceipts(),
  ]);
  const positions = cursors.map((c) => (c > 0 ? c : (deps.startLedger ?? oldestLedger)));
  const slowest = positions.length ? Math.min(...positions) : latestLedger;
  return {
    indexerLagLedgers: Math.max(0, latestLedger - slowest),
    rpcRetentionLedgers: latestLedger - oldestLedger + 1,
    pendingCertificatesCount,
  };
}

export function liveIndexerHealthDeps(config: ChainConfig = chainConfig()): IndexerHealthDeps {
  return {
    ledgers: async () => {
      const health = await server(config).getHealth();
      return { latestLedger: health.latestLedger, oldestLedger: health.oldestLedger };
    },
    cursors: () => Promise.all(sources(config).map((s) => getCursor(s.name, 0))),
    pendingReceipts: async () => {
      const res = await db().query<{ n: string }>("SELECT count(*) AS n FROM receipts WHERE batch_id IS NULL");
      return Number(res.rows[0]?.n ?? 0);
    },
    ...(config.startLedger !== undefined ? { startLedger: config.startLedger } : {}),
  };
}

/** What the verifier says about its own verdict traffic since it started. */
export interface VerifierCounters {
  totalRequests: number;
  errorRequests: number;
}

export interface OpsHealthDeps extends IndexerHealthDeps {
  sponsorBalanceXlm: () => Promise<number>;
  verifierCounters: () => Promise<VerifierCounters>;
}

export interface OpsMeasurement {
  metrics: SystemMetrics;
  /** Signals whose source could not be read; the report says so instead of staying quiet. */
  unmeasured: UnmeasuredSignal[];
}

/**
 * Measures every XC-03 signal, each from its own source. One unreadable source does not stop the
 * others, and never yields a made-up number: it lands in `unmeasured` and its probe fails loudly.
 */
export async function measureOpsHealth(deps: OpsHealthDeps): Promise<OpsMeasurement> {
  const groups: { signals: UnmeasuredSignal["name"][]; read: () => Promise<SystemMetrics> }[] = [
    {
      // Lag, retention and the backlog all come from the same RPC + database round trip.
      signals: ["indexer_lag", "pending_certificates"],
      read: () => measureIndexerHealth(deps),
    },
    { signals: ["sponsor_balance"], read: async () => ({ sponsorBalanceXlm: await deps.sponsorBalanceXlm() }) },
    {
      signals: ["verifier_error_rate"],
      read: async () => {
        const counters = await deps.verifierCounters();
        return { verifierTotalRequests: counters.totalRequests, verifierErrorRequests: counters.errorRequests };
      },
    },
  ];

  const metrics: SystemMetrics = {};
  const unmeasured: UnmeasuredSignal[] = [];
  for (const group of groups) {
    try {
      Object.assign(metrics, await group.read());
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      for (const name of group.signals) unmeasured.push({ name, reason });
    }
  }
  return { metrics, unmeasured };
}

/**
 * The account that pays for the ledger work: the anchorer signs every batch, so its XLM is what a
 * low-balance alert is about. `SPONSOR_ACCOUNT` names it directly when the signing key is not in
 * the environment, which is how pubnet keeps it (in a KMS, not in a variable).
 */
export function sponsorAccount(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.SPONSOR_ACCOUNT?.trim();
  if (explicit) return explicit;
  return anchorerKey(env).publicKey();
}

/** Stroops on-chain, XLM on the dashboard; `stroopsToDecimal` is this repo's one conversion. */
export function stroopsToXlm(stroops: string | bigint): number {
  return Number(stroopsToDecimal(stroops));
}

/** Reads an account's XLM balance from its own ledger entry; Studio has no Horizon to ask. */
export async function readSponsorBalanceXlm(config: ChainConfig, address: string): Promise<number> {
  const entry = await server(config).getAccountEntry(address);
  return stroopsToXlm(entry.balance().toString());
}

/**
 * The verifier's verdict counters over `GET <VERIFIER_URL>/health`. A deployment that reports no
 * counters is not a deployment with a 0% error rate, so this throws instead of guessing.
 */
export async function readVerifierCounters(url: string, fetchImpl: typeof fetch = globalThis.fetch): Promise<VerifierCounters> {
  const base = url.replace(/\/+$/, "");
  const res = await fetchImpl(`${base}/health`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`verifier /health returned HTTP ${res.status}`);
  const body = (await res.json().catch(() => undefined)) as { verdictRequests?: unknown; verdictFailures?: unknown } | undefined;
  if (typeof body?.verdictRequests !== "number" || typeof body?.verdictFailures !== "number") {
    throw new Error("verifier /health reports no verdict counters; it is older than the XC-03 counters");
  }
  return { totalRequests: body.verdictRequests, errorRequests: body.verdictFailures };
}

export function liveOpsHealthDeps(config: ChainConfig = chainConfig(), env: NodeJS.ProcessEnv = process.env): OpsHealthDeps {
  const verifierUrl = (env.VERIFIER_URL ?? "").trim().replace(/\/+$/, "");
  return {
    ...liveIndexerHealthDeps(config),
    sponsorBalanceXlm: () => readSponsorBalanceXlm(config, sponsorAccount(env)),
    verifierCounters: async () => {
      if (!verifierUrl) throw new Error("VERIFIER_URL is not set");
      return readVerifierCounters(verifierUrl);
    },
  };
}
