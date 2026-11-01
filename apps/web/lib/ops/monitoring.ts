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

  const thresholdLedgers = envLedgers ? parseInt(envLedgers, 10) : Math.floor(retentionLedgers * 0.5);
  const thresholdSeconds = maxLagSeconds ?? (envSeconds ? parseInt(envSeconds, 10) : undefined);

  const retentionOk = lagLedgers < thresholdLedgers;
  const secondsOk = thresholdSeconds === undefined || (lagSeconds ?? lagLedgers * 5) < thresholdSeconds;
  const ok = retentionOk && secondsOk;

  const configSource = envSeconds
    ? `env:PROBE_MAX_INDEXER_LAG_SECONDS(${thresholdSeconds}s)`
    : envLedgers
      ? `env:PROBE_MAX_INDEXER_LAG_LEDGERS(${thresholdLedgers})`
      : maxLagSeconds !== undefined
        ? `explicit:maxLagSeconds(${maxLagSeconds}s)`
        : `default:50%retention(${thresholdLedgers})`;

  let alert: string | undefined;
  if (!secondsOk) {
    const s = lagSeconds ?? lagLedgers * 5;
    alert = `WARNING: Indexer wall-clock lag (${s}s >= threshold ${thresholdSeconds}s).`;
  } else if (!retentionOk) {
    alert = `WARNING: Indexer lag has exceeded 50% of retention (${lagLedgers} ledgers >= threshold ${thresholdLedgers}).`;
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
