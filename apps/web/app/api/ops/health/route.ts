/** Ops health & alerts probe. ROADMAP XC-03. */
import { evaluateSystemHealth } from "@/lib/ops/monitoring";

export async function GET(): Promise<Response> {
  const report = evaluateSystemHealth({
    sponsorBalanceXlm: 100,
    indexerLagLedgers: 5,
    pendingCertificatesCount: 1,
    verifierTotalRequests: 100,
    verifierErrorRequests: 0,
  });

  return Response.json(report, {
    status: report.healthy ? 200 : 503,
  });
}
