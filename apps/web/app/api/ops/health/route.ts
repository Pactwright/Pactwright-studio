/** Ops health & alerts probe: measured indexer lag and anchoring backlog. ROADMAP XC-03, S-10. */
import { evaluateSystemHealth } from "@/lib/ops/monitoring";
import { liveIndexerHealthDeps, measureIndexerHealth } from "@/lib/ops/measure";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  let metrics;
  try {
    metrics = await measureIndexerHealth(liveIndexerHealthDeps());
  } catch (err) {
    console.error("Health measurement failed:", err);
    return Response.json({ healthy: false, probes: [], alerts: ["CRITICAL: health could not be measured"] }, { status: 503 });
  }
  const report = evaluateSystemHealth(metrics);
  return Response.json({ ...report, metrics }, { status: report.healthy ? 200 : 503 });
}
