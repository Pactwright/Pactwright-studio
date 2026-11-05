/**
 * Ops health evaluation: pure functions over the metrics / unmeasured signals.
 * ROADMAP XC-03, S-10.
 *
 * Each signal's probe takes only the numbers needed to evaluate its threshold. It returns `{ name,
 * ok, value?, threshold?, configSource?, alert?, unhealthySince?, alertCount? }`. When a signal could not be measured,
 * `evaluateSystemHealth` turns each unmeasured record into a failing probe with the reading error
 * so that an unreachable source cannot look like a clean pass.
 */
import { getAnchorVerificationRecord } from "@/lib/anchorer";
import { DEFAULT_RPC_RETENTION } from "@/lib/indexer/backfill";

/**
 * Testnet closes a ledger every 5 seconds -- measured 2026-11-05 against `getHealth`: ledger
 * 5570784 -> 5570799 in 75 s, with `ledgerRetentionWindow` 120960 (7 days at the same rate).
 * Used to turn a lag in ledgers into hours, which is the unit the alert is worth reading in.
 */
export const SECONDS_PER_LEDGER = 5;

/**
 * Worst gap between `studio-cron` runs that were actually delivered: 7.91 h, measured 2026-11-05 over
 * the 56 `schedule` runs of the previous 6.74 days (median 3.02 h, p90 5.67 h, 8.3 runs a day against
 * the 312 a day the two cron entries ask for -- 2.66%). The workflow wants a sync every 5 minutes and
 * GitHub delivers the ticks late -- see the header of `.github/workflows/studio-cron.yml` for the
 * evidence, including the control that shows it is not this workflow's own configuration.
 */
export const MEASURED_MAX_SYNC_GAP_SECONDS = 28483;

/**
 * An indexer's lag is how long ago it last ran, so the warning has to clear the gap the scheduler
 * really produces or it fires on an ordinary late tick -- and nothing else. The old default of 50% of
 * retention was 60480 ledgers, about 3.5 days: on 2026-11-05 `/api/ops/health` answered `healthy: true`
 * at 5673 ledgers (~7.9 h) behind and again at 12 ledgers, the sawtooth this cadence produces, with
 * nothing in the report to tell the two apart.
 *
 * Twice the worst measured gap alerts about 15.8 h after syncing stops: close enough to be worth acting
 * on, loose enough to tolerate one more late tick. The retention half stays as the ceiling, because
 * waiting longer than half the retention window risks the events going away before anyone is told --
 * which is why a ~24 h window still warns at 8640 ledgers, exactly as it did before.
 */
export const MAX_LAG_LEDGERS_FROM_CADENCE = Math.ceil(
  (2 * MEASURED_MAX_SYNC_GAP_SECONDS) / SECONDS_PER_LEDGER
);

export type SignalName =
  | "sponsor_balance"
  | "indexer_lag"
  | "pending_certificates"
  | "verifier_error_rate"
  | "anchor_verification"
  | string;

export interface SystemMetrics {
  sponsorBalanceXlm?: number;
  indexerLagLedgers?: number;
  rpcRetentionLedgers?: number;
  indexerLagSeconds?: number;
  pendingCertificatesCount?: number;
  verifierTotalRequests?: number;
  verifierErrorRequests?: number;
}

export interface UnmeasuredSignal {
  name: SignalName;
  reason: string;
}

export interface ProbeResult {
  name: SignalName;
  ok: boolean;
  /** Absent when the signal could not be measured — a probe reports no number it did not read. */
  value?: number;
  threshold?: number;
  configSource?: string;
  alert?: string;
  unhealthySince?: string;
  alertCount?: number;
}

export interface SystemHealthReport {
  healthy: boolean;
  probes: ProbeResult[];
  alerts: string[];
}

/** Ledgers as hours to one decimal, at the measured 5 s/ledger: the unit a lag alert reads in. */
function hours(ledgers: number): number {
  return Math.round((ledgers * SECONDS_PER_LEDGER * 10) / 3600) / 10;
}

export function probeSponsorBalance(balanceXlm: number, minThreshold?: number): ProbeResult {
  const envVal = process.env.PROBE_MIN_SPONSOR_BALANCE_XLM;
  const threshold = minThreshold ?? (envVal ? parseFloat(envVal) : 10);
  const configSource =
    minThreshold !== undefined
      ? "explicit:argument"
      : envVal
        ? "env:PROBE_MIN_SPONSOR_BALANCE_XLM"
        : "default:10";
  const ok = balanceXlm >= threshold;
  return {
    name: "sponsor_balance",
    ok,
    value: balanceXlm,
    threshold,
    configSource,
    alert: ok
      ? undefined
      : `CRITICAL: Sponsor account balance is low (${balanceXlm} XLM < threshold ${threshold} XLM).`,
  };
}

export function probeIndexerLag(
  lagLedgers: number,
  retentionLedgers = DEFAULT_RPC_RETENTION,
  maxLagSeconds?: number,
  lagSeconds?: number
): ProbeResult {
  const envLedgers = process.env.PROBE_MAX_INDEXER_LAG_LEDGERS;
  const envSeconds = process.env.PROBE_MAX_INDEXER_LAG_SECONDS;

  const retentionHalf = Math.floor(retentionLedgers * 0.5);
  const cadenceBinds = MAX_LAG_LEDGERS_FROM_CADENCE < retentionHalf;
  const thresholdLedgers = envLedgers
    ? parseInt(envLedgers, 10)
    : Math.min(retentionHalf, MAX_LAG_LEDGERS_FROM_CADENCE);
  const thresholdSeconds = maxLagSeconds ?? (envSeconds ? parseInt(envSeconds, 10) : undefined);

  const ledgerOk = lagLedgers < thresholdLedgers;
  const secondsOk = thresholdSeconds === undefined || (lagSeconds ?? lagLedgers * 5) < thresholdSeconds;
  const ok = ledgerOk && secondsOk;

  const configSource = envSeconds
    ? `env:PROBE_MAX_INDEXER_LAG_SECONDS(${thresholdSeconds}s)`
    : envLedgers
      ? `env:PROBE_MAX_INDEXER_LAG_LEDGERS(${thresholdLedgers})`
      : maxLagSeconds !== undefined
        ? `explicit:maxLagSeconds(${maxLagSeconds}s)`
        : cadenceBinds
          ? `default:cadence(${thresholdLedgers})`
          : `default:50%retention(${thresholdLedgers})`;

  let alert: string | undefined;
  if (!secondsOk) {
    const s = lagSeconds ?? lagLedgers * 5;
    alert = `WARNING: Indexer wall-clock lag (${s}s >= threshold ${thresholdSeconds}s).`;
  } else if (!ledgerOk) {
    alert = cadenceBinds
      ? `WARNING: Indexer lag (${lagLedgers} ledgers, ~${hours(lagLedgers)}h) is past the cadence-derived threshold ${thresholdLedgers} (~${hours(thresholdLedgers)}h).`
      : `WARNING: Indexer lag has exceeded 50% of retention (${lagLedgers} ledgers >= threshold ${thresholdLedgers}).`;
  }

  return {
    name: "indexer_lag",
    ok,
    value: lagLedgers,
    threshold: thresholdLedgers,
    configSource,
    alert,
  };
}

export function probePendingCertificates(
  pendingCount: number,
  maxPending?: number
): ProbeResult {
  const envVal = process.env.PROBE_MAX_PENDING_CERTIFICATES;
  const batchEnv = process.env.ANCHOR_MAX_BATCH_SIZE;
  const drainCapacity = batchEnv ? parseInt(batchEnv, 10) * 2 : 500;
  const threshold =
    maxPending ??
    (envVal ? parseInt(envVal, 10) : Math.max(500, drainCapacity));
  const configSource =
    maxPending !== undefined
      ? "explicit:argument"
      : envVal
        ? "env:PROBE_MAX_PENDING_CERTIFICATES"
        : batchEnv
          ? "derived:ANCHOR_MAX_BATCH_SIZE*2"
          : "default:500";
  const ok = pendingCount <= threshold;
  return {
    name: "pending_certificates",
    ok,
    value: pendingCount,
    threshold,
    configSource,
    alert: ok
      ? undefined
      : `WARNING: Backlog of pending unanchored certificates (${pendingCount} > threshold ${threshold}).`,
  };
}

export function probeAnchorVerification(
  failure = getAnchorVerificationRecord().lastFailure
): ProbeResult {
  const ok = !failure;
  return {
    name: "anchor_verification",
    ok,
    value: failure ? 0 : 1,
    threshold: 1,
    configSource: "on-chain:ReceiptAnchor.verify_receipt",
    alert: ok
      ? undefined
      : `CRITICAL: Sampled post-anchor verification failed on-chain for batch ${failure?.batchId}: ${failure?.reason}`,
  };
}

export function probeVerifierErrorRate(
  totalRequests: number,
  errorRequests: number,
  maxErrorRate?: number
): ProbeResult {
  const envVal = process.env.PROBE_MAX_VERIFIER_ERROR_RATE;
  const threshold = maxErrorRate ?? (envVal ? parseFloat(envVal) : 0.05);
  const configSource =
    maxErrorRate !== undefined
      ? "explicit:argument"
      : envVal
        ? "env:PROBE_MAX_VERIFIER_ERROR_RATE"
        : "default:0.05";

  if (totalRequests === 0) {
    return {
      name: "verifier_error_rate",
      ok: true,
      value: 0,
      threshold,
      configSource,
    };
  }

  const rate = errorRequests / totalRequests;
  const ok = rate <= threshold;
  return {
    name: "verifier_error_rate",
    ok,
    value: rate,
    threshold,
    configSource,
    alert: ok
      ? undefined
      : `CRITICAL: Verifier error rate elevated (${(rate * 100).toFixed(2)}% > threshold ${(threshold * 100).toFixed(2)}%).`,
  };
}

/**
 * Runs the probes for the metrics that were measured, then reports each `unmeasured` signal as a
 * failing probe. A signal nobody could read is not a healthy signal, and an endpoint that simply
 * left it out would make an outage look like an all-clear (ROADMAP XC-03).
 */
export function evaluateSystemHealth(metrics: SystemMetrics, unmeasured: UnmeasuredSignal[] = []): SystemHealthReport {
  const probes: ProbeResult[] = [];
  if (metrics.sponsorBalanceXlm !== undefined) probes.push(probeSponsorBalance(metrics.sponsorBalanceXlm));
  if (metrics.indexerLagLedgers !== undefined) {
    probes.push(probeIndexerLag(metrics.indexerLagLedgers, metrics.rpcRetentionLedgers, undefined, metrics.indexerLagSeconds));
  }
  if (metrics.pendingCertificatesCount !== undefined) {
    probes.push(probePendingCertificates(metrics.pendingCertificatesCount));
  }
  const anchorFailure = getAnchorVerificationRecord().lastFailure;
  if (anchorFailure) {
    probes.push(probeAnchorVerification(anchorFailure));
  }
  if (metrics.verifierTotalRequests !== undefined && metrics.verifierErrorRequests !== undefined) {
    probes.push(probeVerifierErrorRate(metrics.verifierTotalRequests, metrics.verifierErrorRequests));
  }
  for (const { name, reason } of unmeasured) {
    probes.push({
      name,
      ok: false,
      configSource: "unmeasured",
      alert: `CRITICAL: ${name} could not be measured (${reason}); its threshold was not checked.`,
    });
  }

  const alerts = probes.map((p) => p.alert).filter((a): a is string => Boolean(a));
  const healthy = alerts.length === 0;

  return {
    healthy,
    probes,
    alerts,
  };
}
