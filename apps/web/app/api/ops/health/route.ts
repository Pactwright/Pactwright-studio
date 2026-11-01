/** Ops health & alerts probe: all four XC-03 signals, each measured from its own source. ROADMAP XC-03, S-10. */
import { evaluateSystemHealth } from "@/lib/ops/monitoring";
import { liveOpsHealthDeps, measureOpsHealth } from "@/lib/ops/measure";
import { recordProbeHistory, shouldDeliverAlerts } from "@/lib/ops/history";
import { deliverAlertWebhook } from "@/lib/ops/webhook";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  let measured;
  try {
    measured = await measureOpsHealth(liveOpsHealthDeps());
  } catch (err) {
    // Only a deployment that cannot be configured at all gets here; a source that is merely
    // unreachable is reported as one failing probe among the ones that did run.
    console.error("Health measurement failed:", err);
    return Response.json(
      { healthy: false, probes: [], alerts: ["CRITICAL: health could not be measured"] },
      { status: 503 }
    );
  }

  const report = evaluateSystemHealth(measured.metrics, measured.unmeasured);

  // Record probe history and enrich with unhealthySince & alertCount (ROADMAP XC-03, S-10, #47)
  let enrichedProbes = report.probes;
  try {
    enrichedProbes = await recordProbeHistory(report.probes);
  } catch (dbErr) {
    console.error("Failed to record probe history in db:", dbErr);
  }

  // Deliver alert webhook on state change (ROADMAP XC-03, #45)
  if (!report.healthy && shouldDeliverAlerts(enrichedProbes)) {
    try {
      await deliverAlertWebhook({
        service: "pactwright-studio",
        healthy: report.healthy,
        alerts: report.alerts,
        probes: enrichedProbes,
        timestamp: new Date().toISOString(),
      });
    } catch (whErr) {
      console.error("Failed to deliver alert webhook:", whErr);
    }
  }

  return Response.json(
    { ...report, probes: enrichedProbes, metrics: measured.metrics },
    { status: report.healthy ? 200 : 503 }
  );
}
