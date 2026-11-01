/** Anchorer cron (protected by CRON_SECRET). ROADMAP S-04. */
import { anchor } from "@/lib/anchorer";

export async function GET(request: Request): Promise<Response> {
  // Fail closed: without CRON_SECRET anyone could trigger indexing or paid anchoring transactions.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return Response.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  {
    const authHeader = request.headers.get("authorization");
    const secretHeader = request.headers.get("x-cron-secret");
    const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (bearer !== cronSecret && secretHeader !== cronSecret) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const maxBatchSize = process.env.ANCHOR_MAX_BATCH_SIZE
      ? parseInt(process.env.ANCHOR_MAX_BATCH_SIZE, 10)
      : undefined;
    const minAnchorIntervalSeconds = process.env.ANCHOR_MIN_INTERVAL_SECONDS
      ? parseInt(process.env.ANCHOR_MIN_INTERVAL_SECONDS, 10)
      : undefined;
    const result = await anchor({ maxBatchSize, minAnchorIntervalSeconds });
    return Response.json({ ok: true, result });
  } catch (err) {
    console.error("Anchoring cycle failed:", err);
    return Response.json({ error: "Anchoring cycle failed" }, { status: 500 });
  }
}
