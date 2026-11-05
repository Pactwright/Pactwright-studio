/** Indexer cron (protected by CRON_SECRET). ROADMAP S-02. */
import { SyncFailuresError, sync } from "@/lib/indexer";
import { cronAuthFailure } from "@/lib/cron-auth";

export async function GET(request: Request): Promise<Response> {
  const unauthorized = cronAuthFailure(request);
  if (unauthorized) return unauthorized;

  try {
    const result = await sync();
    return Response.json({ ok: true, result });
  } catch (err) {
    console.error("Sync failed:", err);
    if (err instanceof SyncFailuresError) {
      const outside = err.failures.filter((f) => f.reason === "outsideRetention");
      // The sources that could be read were still indexed, so `result` is reported either way.
      if (outside.length > 0) {
        // A status of its own, because this failure will not fix itself: a cursor older than the RPC's
        // retention needs /api/backfill with a history source before a later pass can read that range.
        return Response.json(
          { error: "outsideRetention", outsideRetention: outside, failedSources: err.failures, result: err.report },
          { status: 503 },
        );
      }
      return Response.json(
        { error: "Sync failed", failedSources: err.failures, result: err.report },
        { status: 500 },
      );
    }
    return Response.json({ error: "Sync failed" }, { status: 500 });
  }
}
