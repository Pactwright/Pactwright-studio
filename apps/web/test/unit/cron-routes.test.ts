/**
 * #49: the two operator routes answer differently for the two ways a pass can fail.
 *
 * `/api/sync` used to flatten every failure into `{ error: "Sync failed" }` with a 500, so a source
 * parked outside RPC retention — which will not fix itself, and needs `/api/backfill` — looked exactly
 * like a transient hiccup that the next cron tick would clear. It now answers 503 with an
 * `outsideRetention` body naming source, cursor and oldest ledger, keeps 500 for a read that simply
 * failed, and reports the sources it did index either way.
 *
 * `/api/backfill` is the new half: the recovery path exists so that a human or `studio-cron` can call
 * it. Both routes hide behind the same `CRON_SECRET` guard, and both say what is missing instead of
 * letting the first fetch throw.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/indexer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/indexer")>();
  return { ...actual, sync: vi.fn() };
});
vi.mock("@/lib/indexer/backfill", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/indexer/backfill")>();
  return { ...actual, syncWithHistory: vi.fn() };
});

import { sync, SyncFailuresError, type SyncReport, type SourceFailure } from "@/lib/indexer";
import { syncWithHistory } from "@/lib/indexer/backfill";
import { GET as syncRoute } from "../../app/api/sync/route";
import { GET as backfillRoute } from "../../app/api/backfill/route";

const SECRET = "super-secret-cron-key";

const report = (overrides: Partial<SyncReport> = {}): SyncReport => ({
  sources: [{ source: "pact", fromLedger: 1000, toLedger: 2000, indexed: 4, deferred: 0 }],
  failures: [],
  replayed: 0,
  deferred: 0,
  ...overrides,
});

const outside: SourceFailure = {
  source: "refund_vault:CV1",
  reason: "outsideRetention",
  cursor: 900,
  oldestLedger: 1200,
  message: "refund_vault:CV1: cursor 900 is older than the RPC's oldest ledger 1200.",
};
const readFailure: SourceFailure = {
  source: "pact",
  reason: "readFailed",
  cursor: 1000,
  oldestLedger: 1200,
  message: "RPC read failed for CPACT",
};

const authorized = (path: string) => new Request(`http://localhost${path}`, { headers: { Authorization: `Bearer ${SECRET}` } });

describe("#49 the operator cron routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The routes log the failure they are about to answer with; the assertions below are the point.
    vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.CRON_SECRET = SECRET;
    delete process.env.HISTORY_RPC_URL;
    delete process.env.HISTORY_SOURCE_URL;
  });

  describe("/api/sync", () => {
    it("returns the pass's report when every source could be read", async () => {
      vi.mocked(sync).mockResolvedValue(report());

      const res = await syncRoute(authorized("/api/sync"));

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ ok: true, result: { sources: [{ source: "pact", indexed: 4 }] } });
    });

    it("answers 503 with the source, its cursor and the oldest ledger when a source is outside retention", async () => {
      vi.mocked(sync).mockRejectedValue(new SyncFailuresError([outside], report()));

      const res = await syncRoute(authorized("/api/sync"));
      const body = await res.json();

      expect(res.status).toBe(503);
      expect(body.error).toBe("outsideRetention");
      expect(body.outsideRetention).toEqual([outside]);
      // The gap is named, so the operator knows which source to backfill and how far it must reach.
      expect(body.outsideRetention[0]).toMatchObject({ source: "refund_vault:CV1", cursor: 900, oldestLedger: 1200 });
      // And what the pass still did is reported rather than discarded.
      expect(body.result.sources).toHaveLength(1);
    });

    it("answers 500 for a source that merely failed to read, with no outsideRetention key", async () => {
      // A transient RPC error must not be dressed up as a gap that needs a backfill.
      vi.mocked(sync).mockRejectedValue(new SyncFailuresError([readFailure], report({ sources: [] })));

      const res = await syncRoute(authorized("/api/sync"));
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.error).toBe("Sync failed");
      expect(body.failedSources).toEqual([readFailure]);
      expect(body.outsideRetention).toBeUndefined();
    });

    it("still answers 503 when one source is outside retention and another failed to read", async () => {
      // The retention failure is the one that needs acting on, so it decides the status.
      vi.mocked(sync).mockRejectedValue(new SyncFailuresError([readFailure, outside], report({ sources: [] })));

      const res = await syncRoute(authorized("/api/sync"));
      const body = await res.json();

      expect(res.status).toBe(503);
      expect(body.outsideRetention).toEqual([outside]);
      expect(body.failedSources).toHaveLength(2);
    });

    it("answers 500 for a failure before any source was read", async () => {
      vi.mocked(sync).mockRejectedValue(new Error("RPC unreachable"));

      const res = await syncRoute(authorized("/api/sync"));

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "Sync failed" });
    });

    it("refuses an unauthorized caller and a deployment with no secret, before reading anything", async () => {
      const wrongSecret = await syncRoute(new Request("http://localhost/api/sync", { headers: { "x-cron-secret": "no" } }));
      expect(wrongSecret.status).toBe(401);
      expect(vi.mocked(sync)).not.toHaveBeenCalled();

      delete process.env.CRON_SECRET;
      const noSecret = await syncRoute(authorized("/api/sync"));
      expect(noSecret.status).toBe(503);
      expect(vi.mocked(sync)).not.toHaveBeenCalled();
    });
  });

  describe("/api/backfill", () => {
    it("says what is missing when no history source is configured", async () => {
      const res = await backfillRoute(authorized("/api/backfill"));
      const body = await res.json();

      expect(res.status).toBe(503);
      expect(body.error).toBe("noHistorySource");
      expect(body.hint).toContain("HISTORY_RPC_URL");
      // Refusing here is the point: without a history source there is nothing to read the gap from.
      expect(vi.mocked(syncWithHistory)).not.toHaveBeenCalled();
    });

    it("accepts either history source variable", async () => {
      vi.mocked(syncWithHistory).mockResolvedValue({ backfillResults: [], syncResults: [] });
      process.env.HISTORY_RPC_URL = "https://archival.example";

      const res = await backfillRoute(authorized("/api/backfill"));
      expect(res.status).toBe(200);
      expect(vi.mocked(syncWithHistory)).toHaveBeenCalledTimes(1);

      delete process.env.HISTORY_RPC_URL;
      process.env.HISTORY_SOURCE_URL = "https://history.example/events";
      expect((await backfillRoute(authorized("/api/backfill"))).status).toBe(200);
    });

    it("answers 503 when the pass still could not read a source after backfilling", async () => {
      process.env.HISTORY_RPC_URL = "https://archival.example";
      vi.mocked(syncWithHistory).mockRejectedValue(new SyncFailuresError([outside], report()));

      const res = await backfillRoute(authorized("/api/backfill"));
      const body = await res.json();

      expect(res.status).toBe(503);
      expect(body.error).toBe("outsideRetention");
      expect(body.outsideRetention).toEqual([outside]);
    });

    it("passes the history source's own refusal through as the reason", async () => {
      // e.g. the archival RPC does not keep the range either — an operator problem with a named cause.
      vi.mocked(syncWithHistory).mockRejectedValue(new Error("HISTORY_RPC_URL only keeps events from ledger 50000; needed 10000"));
      process.env.HISTORY_RPC_URL = "https://archival.example";

      const res = await backfillRoute(authorized("/api/backfill"));
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.error).toBe("Backfill failed");
      expect(body.reason).toContain("only keeps events from ledger 50000");
    });

    it("is behind the same guard as /api/sync", async () => {
      expect((await backfillRoute(new Request("http://localhost/api/backfill"))).status).toBe(401);

      delete process.env.CRON_SECRET;
      expect((await backfillRoute(authorized("/api/backfill"))).status).toBe(503);
    });
  });
});
