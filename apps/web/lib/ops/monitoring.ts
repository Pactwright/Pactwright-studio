/**
 * System monitoring probes and alerting for Pactwright Studio. ROADMAP XC-03.
 * Probes: sponsor balance, indexer lag, pending certificates, verifier error rate.
 */

/** Probes run only for the metrics that were measured; nothing is reported on made-up values. */
export interface SystemMetrics {
  sponsorBalanceXlm?: number;
  indexerLagLedgers?: number;
  rpcRetentionLedgers?: number;
  pendingCertificatesCount?: number;
  verifierTotalRequests?: number;
  verifierErrorRequests?: number;
}

/** The four signals `/api/ops/health` is supposed to report (ROADMAP XC-03), named as their probes are. */
export type SignalName = "sponsor_balance" | "indexer_lag" | "pending_certificates" | "verifier_error_rate";

/** A signal the endpoint tried to read and could not, with the error that said why. */
export interface UnmeasuredSignal {
  name: SignalName;
  reason: string;
}

export interface ProbeResult {
  name: string;
  ok: boolean;
  /** Absent when the signal could not be measured — a probe reports no number it did not read. */
  value?: number;
  threshold?: number;
  alert?: string;
}

export interface SystemHealthReport {
  healthy: boolean;
  probes: ProbeResult[];
  alerts: string[];
}

export function probeSponsorBalance(balanceXlm: number, minThreshold = 10): ProbeResult {
  const ok = balanceXlm >= minThreshold;
  return {
    name: "sponsor_balance",
    ok,
    value: balanceXlm,
    threshold: minThreshold,
    alert: ok
      ? undefined
      : `CRITICAL: Sponsor account balance is low (${balanceXlm} XLM < threshold ${minThreshold} XLM).`,
  };
}

export function probeIndexerLag(
  lagLedgers: number,
  retentionLedgers = 17280
): ProbeResult {
  const threshold = Math.floor(retentionLedgers * 0.5);
  const ok = lagLedgers < threshold;
  return {
    name: "indexer_lag",
    ok,
    value: lagLedgers,
    threshold,
    alert: ok
      ? undefined
      : `WARNING: Indexer lag has exceeded 50% of retention (${lagLedgers} ledgers >= threshold ${threshold}).`,
  };
}

export function probePendingCertificates(
  pendingCount: number,
  maxPending = 500
): ProbeResult {
  const ok = pendingCount <= maxPending;
  return {
    name: "pending_certificates",
    ok,
    value: pendingCount,
    threshold: maxPending,
    alert: ok
      ? undefined
      : `WARNING: Backlog of pending unanchored certificates (${pendingCount} > threshold ${maxPending}).`,
  };
}

export function probeVerifierErrorRate(
  totalRequests: number,
  errorRequests: number,
  maxErrorRate = 0.05
): ProbeResult {
  if (totalRequests === 0) {
    return {
      name: "verifier_error_rate",
      ok: true,
      value: 0,
      threshold: maxErrorRate,
    };
  }

  const rate = errorRequests / totalRequests;
  const ok = rate <= maxErrorRate;
  return {
    name: "verifier_error_rate",
    ok,
    value: rate,
    threshold: maxErrorRate,
    alert: ok
      ? undefined
      : `CRITICAL: Verifier error rate elevated (${(rate * 100).toFixed(2)}% > threshold ${(maxErrorRate * 100).toFixed(2)}%).`,
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
    probes.push(probeIndexerLag(metrics.indexerLagLedgers, metrics.rpcRetentionLedgers));
  }
  if (metrics.pendingCertificatesCount !== undefined) {
    probes.push(probePendingCertificates(metrics.pendingCertificatesCount));
  }
  if (metrics.verifierTotalRequests !== undefined && metrics.verifierErrorRequests !== undefined) {
    probes.push(probeVerifierErrorRate(metrics.verifierTotalRequests, metrics.verifierErrorRequests));
  }
  for (const { name, reason } of unmeasured) {
    probes.push({ name, ok: false, alert: `CRITICAL: ${name} could not be measured (${reason}); its threshold was not checked.` });
  }

  const alerts = probes.map((p) => p.alert).filter((a): a is string => Boolean(a));
  const healthy = alerts.length === 0;

  return {
    healthy,
    probes,
    alerts,
  };
}
