import { describe, expect, it } from "vitest";
import {
  probeSponsorBalance,
  probeIndexerLag,
  probePendingCertificates,
  probeVerifierErrorRate,
  evaluateSystemHealth,
} from "../../lib/ops/monitoring";
import { measureIndexerHealth } from "../../lib/ops/measure";

describe("Ops monitoring and alerting (ROADMAP XC-03)", () => {
  it("fires alert when sponsor account balance drops below minimum threshold", () => {
    const okProbe = probeSponsorBalance(25, 10);
    expect(okProbe.ok).toBe(true);
    expect(okProbe.alert).toBeUndefined();

    const alertProbe = probeSponsorBalance(5, 10);
    expect(alertProbe.ok).toBe(false);
    expect(alertProbe.alert).toContain("CRITICAL: Sponsor account balance is low");
  });

  it("fires alert when indexer lag reaches 50% of RPC retention", () => {
    const okProbe = probeIndexerLag(100, 17280);
    expect(okProbe.ok).toBe(true);
    expect(okProbe.alert).toBeUndefined();

    const alertProbe = probeIndexerLag(9000, 17280);
    expect(alertProbe.ok).toBe(false);
    expect(alertProbe.alert).toContain("WARNING: Indexer lag has exceeded 50% of retention");
  });

  it("fires alert when pending unanchored certificates exceed backlog limit", () => {
    const okProbe = probePendingCertificates(50, 500);
    expect(okProbe.ok).toBe(true);
    expect(okProbe.alert).toBeUndefined();

    const alertProbe = probePendingCertificates(650, 500);
    expect(alertProbe.ok).toBe(false);
    expect(alertProbe.alert).toContain("WARNING: Backlog of pending unanchored certificates");
  });

  it("fires alert when verifier error rate exceeds 5%", () => {
    const okProbe = probeVerifierErrorRate(1000, 10, 0.05);
    expect(okProbe.ok).toBe(true);
    expect(okProbe.alert).toBeUndefined();

    const alertProbe = probeVerifierErrorRate(100, 8, 0.05); // 8% error rate
    expect(alertProbe.ok).toBe(false);
    expect(alertProbe.alert).toContain("CRITICAL: Verifier error rate elevated");
  });

  it("evaluates complete system health report", () => {
    const healthyReport = evaluateSystemHealth({
      sponsorBalanceXlm: 50,
      indexerLagLedgers: 10,
      pendingCertificatesCount: 15,
      verifierTotalRequests: 500,
      verifierErrorRequests: 2,
    });

    expect(healthyReport.healthy).toBe(true);
    expect(healthyReport.alerts).toHaveLength(0);

    const degradedReport = evaluateSystemHealth({
      sponsorBalanceXlm: 2, // low
      indexerLagLedgers: 12000, // high lag
      pendingCertificatesCount: 750, // high backlog
      verifierTotalRequests: 100,
      verifierErrorRequests: 15, // 15% errors
    });

    expect(degradedReport.healthy).toBe(false);
    expect(degradedReport.alerts.length).toBe(4);
  });

  it("runs only the probes whose metrics were measured", () => {
    const report = evaluateSystemHealth({ indexerLagLedgers: 10, rpcRetentionLedgers: 120960, pendingCertificatesCount: 0 });
    expect(report.probes.map((p) => p.name)).toEqual(["indexer_lag", "pending_certificates"]);
    expect(report.healthy).toBe(true);
  });

  it("measures lag from the slowest cursor and retention from the RPC window", async () => {
    const metrics = await measureIndexerHealth({
      ledgers: async () => ({ latestLedger: 200_000, oldestLedger: 79_041 }),
      cursors: async () => [199_990, 150_000],
      pendingReceipts: async () => 3,
    });
    expect(metrics).toEqual({ indexerLagLedgers: 50_000, rpcRetentionLedgers: 120_960, pendingCertificatesCount: 3 });
    expect(evaluateSystemHealth(metrics).healthy).toBe(true);
  });

  it("counts a never-synced source from INDEX_START_LEDGER, so a stale start alerts", async () => {
    const metrics = await measureIndexerHealth({
      ledgers: async () => ({ latestLedger: 200_000, oldestLedger: 79_041 }),
      cursors: async () => [0],
      pendingReceipts: async () => 0,
      startLedger: 100_000,
    });
    expect(metrics.indexerLagLedgers).toBe(100_000);
    expect(evaluateSystemHealth(metrics).healthy).toBe(false);
  });

  it("bounds indexer lag in wall-clock time and reports config sources (#46)", () => {
    // Alert on wall-clock lag even when within 50% of retention
    const retention = 120960; // 50% is 60480 ledgers (~3.5 days)
    const lagLedgers = 100; // Well below 60480
    const lagSeconds = 600; // 10 minutes lag
    const maxLagSeconds = 300; // 5 minutes threshold

    const probe = probeIndexerLag(lagLedgers, retention, maxLagSeconds, lagSeconds);
    expect(probe.ok).toBe(false);
    expect(probe.alert).toContain("WARNING: Indexer wall-clock lag (600s >= threshold 300s)");
    expect(probe.configSource).toContain("explicit:maxLagSeconds(300s)");
  });

  it("makes all four probe thresholds configurable via environment variables (#46)", () => {
    const originalEnv = { ...process.env };
    try {
      process.env.PROBE_MIN_SPONSOR_BALANCE_XLM = "20";
      process.env.PROBE_MAX_INDEXER_LAG_SECONDS = "120";
      process.env.PROBE_MAX_PENDING_CERTIFICATES = "1000";
      process.env.PROBE_MAX_VERIFIER_ERROR_RATE = "0.02";

      const sponsor = probeSponsorBalance(15);
      expect(sponsor.threshold).toBe(20);
      expect(sponsor.configSource).toBe("env:PROBE_MIN_SPONSOR_BALANCE_XLM");
      expect(sponsor.ok).toBe(false);

      const lag = probeIndexerLag(10, 10000, undefined, 150);
      expect(lag.configSource).toContain("env:PROBE_MAX_INDEXER_LAG_SECONDS(120s)");
      expect(lag.ok).toBe(false);

      const pending = probePendingCertificates(800);
      expect(pending.threshold).toBe(1000);
      expect(pending.configSource).toBe("env:PROBE_MAX_PENDING_CERTIFICATES");
      expect(pending.ok).toBe(true);

      const verifier = probeVerifierErrorRate(100, 3);
      expect(verifier.threshold).toBe(0.02);
      expect(verifier.configSource).toBe("env:PROBE_MAX_VERIFIER_ERROR_RATE");
      expect(verifier.ok).toBe(false);
    } finally {
      process.env = originalEnv;
    }
  });
});
