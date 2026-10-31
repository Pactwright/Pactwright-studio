/** Ops health & alerts probe: all four XC-03 signals, each measured from its own source. ROADMAP XC-03, S-10. */
import { evaluateSystemHealth } from "@/lib/ops/monitoring";
import { liveOpsHealthDeps, measureOpsHealth } from "@/lib/ops/measure";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  let measured;
  try {
    measured = await measureOpsHealth(liveOpsHealthDeps());
  } catch (err) {
    // Only a deployment that cannot be configured at all gets here; a source that is merely
    // unreachable is reported as one failing probe among the ones that did run.
    console.error("Health measurement failed:", err);
    return Response.json({ healthy: false, probes: [], alerts: ["CRITICAL: health could not be measured"] }, { status: 503 });
  }
  const report = evaluateSystemHealth(measured.metrics, measured.unmeasured);
  return Response.json({ ...report, metrics: measured.metrics }, { status: report.healthy ? 200 : 503 });
}
