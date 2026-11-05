/**
 * #49: one source that cannot be read is that source's problem, not the pass's.
 *
 * `sync()` loops every source serially and a single stale cursor used to throw out of the loop, so a
 * RefundVault whose cursor fell behind RPC retention froze the `pact` source with it — nothing was
 * indexed for any contract until a human fixed that one row. The pass now records the failure, keeps
 * reading the others, and raises `SyncFailuresError` at the end so the gap is still reported rather
 * than quietly marked as read. A failing source's cursor does not move.
 *
 * Uses the same strict doubles as the #51 suite, so a row counted as indexed here really was written.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: vi.fn() }));

vi.mock("@/lib/chain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/chain")>();
  return { ...actual, server: vi.fn(), contractEvents: vi.fn() };
});

import { db } from "@/lib/db";
import { contractEvents, server } from "@/lib/chain";
import { sync, SyncFailuresError } from "../../lib/indexer";
import { FakeChain, FakePostgres, config, openedEvent, pactA, refundEvent, wireFakeIndexing } from "./fake-postgres";

let pg: FakePostgres;
let chain: FakeChain;

const vaultCursor = "refund_vault:CVAULT";

beforeEach(() => {
  pg = new FakePostgres();
  chain = new FakeChain();
  wireFakeIndexing(vi.mocked(db), vi.mocked(server), vi.mocked(contractEvents), pg, chain);
});

/** Runs a pass and returns the failure it raised, failing the test if it succeeded. */
async function syncThatFails(): Promise<SyncFailuresError> {
  const err = await sync(config).then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(SyncFailuresError);
  return err as SyncFailuresError;
}

describe("#49 per-source isolation", () => {
  it("indexes the readable source and reports the one whose cursor is outside retention", async () => {
    // The vault fell behind what the RPC keeps; the pact source is current.
    pg.cursors.set(vaultCursor, 800);
    chain.events = [openedEvent(pactA, 1500, "tx-open-1500")];

    const err = await syncThatFails();

    expect(err.failures).toHaveLength(1);
    expect(err.failures[0]).toMatchObject({
      source: vaultCursor,
      reason: "outsideRetention",
      cursor: 800,
      oldestLedger: 1000,
    });
    // The other source was indexed, not skipped with it.
    expect(err.report.sources).toEqual([{ source: "pact", fromLedger: 1000, toLedger: 2000, indexed: 1, deferred: 0 }]);
    expect(pg.pacts.has(pactA)).toBe(true);
    // The broken source's cursor did not move: its range was not read, so it is not marked as read.
    expect(pg.cursors.get(vaultCursor)).toBe(800);
  });

  it("names the source, its cursor and the oldest ledger in the error itself", async () => {
    pg.cursors.set(vaultCursor, 800);

    const err = await syncThatFails();

    expect(err.message).toContain("1 of 2 sources could not be read");
    expect(err.message).toContain(`${vaultCursor} (outsideRetention, cursor 800, oldest 1000)`);
  });

  it("reports a read that failed for another reason as readFailed, and keeps the rest of the pass", async () => {
    // A vault that is not responding at all — same isolation, different cause and a different operator action.
    chain.failReadFor = "CVAULT";
    chain.events = [openedEvent(pactA, 1500, "tx-open-1500")];

    const err = await syncThatFails();

    expect(err.failures).toEqual([
      {
        source: vaultCursor,
        reason: "readFailed",
        cursor: 1000,
        oldestLedger: 1000,
        message: "RPC read failed for CVAULT",
      },
    ]);
    expect(err.report.sources.map((s) => s.indexed)).toEqual([1]);
    expect(pg.cursors.get(vaultCursor)).toBeUndefined();
  });

  it("still replays deferred events when another source could not be read", async () => {
    // Pass 1: the refund is held because its pact does not exist yet.
    chain.events = [refundEvent(pactA, 1500, "tx-refund-1500")];
    await sync(config);
    expect(pg.deferred).toHaveLength(1);

    // Pass 2: its pact has been written by something else, and the vault is now outside retention.
    pg.pacts.set(pactA, { pact_id: pactA, state: "funded", cap: "1.0000000", to_seller: "0.0000000", to_buyer: "0.0000000" });
    pg.cursors.set(vaultCursor, 800);

    const err = await syncThatFails();

    // The pass failed and the held event was still recovered — a broken source cannot also stall the backlog.
    expect(err.failures[0].reason).toBe("outsideRetention");
    expect(err.report.replayed).toBe(1);
    expect(err.report.deferred).toBe(0);
    expect([...pg.pactEvents]).toEqual([`tx-refund-1500|refunded|${pactA}`]);
  });

  it("reports every source it could not read, not just the first", async () => {
    pg.cursors.set(vaultCursor, 800);
    chain.failReadFor = "CPACT";

    const err = await syncThatFails();

    expect(err.report.sources).toHaveLength(0);
    expect(err.failures.map((f) => [f.source, f.reason])).toEqual([
      ["pact", "readFailed"],
      [vaultCursor, "outsideRetention"],
    ]);
    expect(err.message).toContain("2 of 2 sources could not be read");
  });

  it("succeeds without raising once the failing source's cursor is moved forward", async () => {
    pg.cursors.set(vaultCursor, 800);
    chain.events = [openedEvent(pactA, 1500, "tx-open-1500")];
    await syncThatFails();

    // A backfill closed the gap, so the next pass reads the vault normally and reports no failures.
    pg.cursors.set(vaultCursor, 1500);
    const report = await sync(config);

    expect(report.failures).toEqual([]);
    expect(report.sources.map((s) => s.source)).toEqual(["pact", vaultCursor]);
  });
});
