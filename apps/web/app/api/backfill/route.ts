/**
 * Close an indexing gap from a history source, then resume RPC sync (protected by CRON_SECRET).
 * ROADMAP S-03, studio#49.
 *
 * `sync` refuses to move a source's cursor past ledgers the RPC no longer keeps, because doing so marks
 * events that were never read as read. That is the right failure, but until this route existed the only
 * way to act on it was a human at a REPL: `backfill()`, `syncWithHistory()`, `HttpHistorySource` and
 * `RpcHistorySource` were reached only from tests. So the recovery path `S-03` describes is now callable
 * by `studio-cron` or by an operator with the same `CRON_SECRET` as `/api/sync`.
 */
import { SyncFailuresError } from "@/lib/indexer";
import { syncWithHistory } from "@/lib/indexer/backfill";
import { cronAuthFailure } from "@/lib/cron-auth";

export async function GET(request: Request): Promise<Response> {
  const unauthorized = cronAuthFailure(request);
  if (unauthorized) return unauthorized;

  // Say what is missing rather than letting the first fetch throw: without a history source there is
  // nothing to read the gap from, and no retry of this route will ever change that.
  if (!process.env.HISTORY_RPC_URL && !process.env.HISTORY_SOURCE_URL) {
    return Response.json(
      {
        error: "noHistorySource",
        hint: "Set HISTORY_RPC_URL (an archival RPC) or HISTORY_SOURCE_URL (an HTTP history service), then call this route again.",
      },
      { status: 503 },
    );
  }

  try {
    const result = await syncWithHistory();
    return Response.json({ ok: true, result });
  } catch (err) {
    console.error("Backfill failed:", err);
    if (err instanceof SyncFailuresError) {
      // The backfill ran and some sources caught up; name the ones that still cannot be read.
      return Response.json(
        { error: "outsideRetention", outsideRetention: err.failures, result: err.report },
        { status: 503 },
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    // The history source's own refusal (a range it does not keep, a response without
    // `scannedThroughLedger`) is an operator problem with a named cause, not a server bug.
    return Response.json({ error: "Backfill failed", reason: message }, { status: 500 });
  }
}
