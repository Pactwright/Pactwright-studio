import { describe, expect, it, vi, beforeEach } from "vitest";
import { recordProbeHistory, shouldDeliverAlerts } from "../../lib/ops/history";
import type { ProbeResult } from "../../lib/ops/monitoring";

describe("Ops probe history and deduplication (ROADMAP XC-03, S-10, #47)", () => {
  const queries: Array<[string, unknown[] | undefined]> = [];

  beforeEach(() => {
    queries.length = 0;
  });

  it("persists probe runs and enriches failing probes with unhealthySince and alertCount", async () => {
    const fakeClient = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        queries.push([sql, params]);
        if (sql.includes("SELECT recorded_at FROM ops_probe_runs")) {
          // Last healthy was 2 hours ago
          return { rows: [{ recorded_at: new Date(Date.now() - 7200 * 1000) }] };
        }
        if (sql.includes("SELECT MIN(recorded_at) as first_unhealthy")) {
          // First unhealthy in streak was 1 hour ago, alertCount is 3
          return {
            rows: [
              {
                first_unhealthy: new Date(Date.now() - 3600 * 1000),
                alert_count: "3",
              },
            ],
          };
        }
        return { rows: [], rowCount: 1 };
      }),
      release: vi.fn(),
    };

    const fakePool = {
      connect: async () => fakeClient,
    } as any;

    const probes: ProbeResult[] = [
      { name: "sponsor_balance", ok: true, value: 50, threshold: 10 },
      { name: "indexer_lag", ok: false, value: 10000, threshold: 5000, alert: "WARNING: lag high" },
    ];

    const enriched = await recordProbeHistory(probes, fakePool);

    expect(enriched).toHaveLength(2);
    expect(enriched[0].ok).toBe(true);
    expect(enriched[0].unhealthySince).toBeUndefined();

    expect(enriched[1].ok).toBe(false);
    expect(enriched[1].unhealthySince).toBeDefined();
    expect(enriched[1].alertCount).toBe(3);

    // Verify insert queries
    const inserts = queries.filter(([sql]) => sql.includes("INSERT INTO ops_probe_runs"));
    expect(inserts).toHaveLength(2);
  });

  it("deduplicates alerts so only state changes trigger delivery", () => {
    // 1. First time alert (alertCount = 1) -> should deliver
    const firstAlert: any[] = [
      { name: "sponsor_balance", ok: false, alertCount: 1 },
      { name: "indexer_lag", ok: true },
    ];
    expect(shouldDeliverAlerts(firstAlert)).toBe(true);

    // 2. Persistent alert (alertCount = 5) -> should NOT deliver (deduplicated)
    const persistentAlert: any[] = [
      { name: "sponsor_balance", ok: false, alertCount: 5 },
      { name: "indexer_lag", ok: true },
    ];
    expect(shouldDeliverAlerts(persistentAlert)).toBe(false);

    // 3. Healthy system -> should NOT deliver
    const healthy: any[] = [
      { name: "sponsor_balance", ok: true },
      { name: "indexer_lag", ok: true },
    ];
    expect(shouldDeliverAlerts(healthy)).toBe(false);
  });
});
