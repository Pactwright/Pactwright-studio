/**
 * System monitoring probes and alerting for Pactwright Studio. ROADMAP XC-03.
 * Probes: sponsor balance, indexer lag, pending certificates, verifier error rate.
 */

export interface SystemMetrics {
  sponsorBalanceXlm: number;
  indexerLagLedgers: number;
  rpcRetentionLedgers?: number;
  pendingCertificatesCount: number;
  verifierTotalRequests: number;
  verifierErrorRequests: number;
}

export interface ProbeResult {
  name: string;
  ok: boolean;
  value: number;
  threshold: number;
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
 * Runs all system health probes and gathers triggered alerts.
 */
export function evaluateSystemHealth(metrics: SystemMetrics): SystemHealthReport {
  const probes = [
    probeSponsorBalance(metrics.sponsorBalanceXlm),
    probeIndexerLag(metrics.indexerLagLedgers, metrics.rpcRetentionLedgers),
    probePendingCertificates(metrics.pendingCertificatesCount),
    probeVerifierErrorRate(metrics.verifierTotalRequests, metrics.verifierErrorRequests),
  ];

  const alerts = probes.map((p) => p.alert).filter((a): a is string => Boolean(a));
  const healthy = alerts.length === 0;

  return {
    healthy,
    probes,
    alerts,
  };
}
