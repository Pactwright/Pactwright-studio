/**
 * Append-only ops probe runs for history, duration tracking, and alert deduplication.
 * ROADMAP XC-03, S-10, #47.
 */
import { db } from "@/lib/db";
import type { ProbeResult } from "./monitoring";

export interface EnrichedProbeResult extends ProbeResult {
  unhealthySince?: string;
  alertCount?: number;
}

/**
 * Records probe runs to the database and calculates unhealthySince and alertCount for deduplication.
 */
export async function recordProbeHistory(
  probes: ProbeResult[],
  pool = db()
): Promise<EnrichedProbeResult[]> {
  const client = await pool.connect();
  try {
    const enrichedProbes: EnrichedProbeResult[] = [];

    for (const probe of probes) {
      // 1. Record the current probe run
      await client.query(
        `INSERT INTO ops_probe_runs (signal, value, threshold, healthy, alert, recorded_at)
         VALUES ($1, $2, $3, $4, $5, now())`,
        [
          probe.name,
          probe.value ?? null,
          probe.threshold ?? null,
          probe.ok,
          probe.alert ?? null,
        ]
      );

      // 2. Query history to find unhealthy streak and first-seen time
      if (!probe.ok) {
        // Find the last healthy run for this signal
        const lastHealthyRes = await client.query<{ recorded_at: Date }>(
          `SELECT recorded_at FROM ops_probe_runs
           WHERE signal = $1 AND healthy = true
           ORDER BY recorded_at DESC LIMIT 1`,
          [probe.name]
        );
        const lastHealthyAt = lastHealthyRes.rows[0]?.recorded_at ?? new Date(0);

        // Find the first unhealthy run after the last healthy run (unhealthySince)
        const streakRes = await client.query<{ first_unhealthy: Date; alert_count: string }>(
          `SELECT MIN(recorded_at) as first_unhealthy, COUNT(*) as alert_count
           FROM ops_probe_runs
           WHERE signal = $1 AND healthy = false AND recorded_at > $2`,
          [probe.name, lastHealthyAt]
        );

        const unhealthySince = streakRes.rows[0]?.first_unhealthy
          ? new Date(streakRes.rows[0].first_unhealthy).toISOString()
          : new Date().toISOString();
        const alertCount = streakRes.rows[0]?.alert_count
          ? parseInt(streakRes.rows[0].alert_count, 10)
          : 1;

        enrichedProbes.push({
          ...probe,
          unhealthySince,
          alertCount,
        });
      } else {
        enrichedProbes.push(probe);
      }
    }

    return enrichedProbes;
  } finally {
    client.release();
  }
}

/**
 * Checks if the current alerts contain new state transitions requiring notification delivery.
 * Returns true if this is the first alert of an unhealthy streak (alertCount === 1).
 */
export function shouldDeliverAlerts(probes: EnrichedProbeResult[]): boolean {
  return probes.some((p) => !p.ok && (p.alertCount === undefined || p.alertCount === 1));
}
