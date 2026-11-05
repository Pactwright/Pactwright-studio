/**
 * #51: an event whose pact row does not exist yet is retained and replayed, never dropped.
 *
 * `pact_events.pact_id` references `pacts`, so a refund that arrives before its pact's `opened` event —
 * or for an M0 pact the facilitator has not reported — cannot be written. The old indexer counted it as
 * skipped and advanced the source's cursor past it, losing it for good. These tests run a pass where the
 * refund comes first and a second pass where the pact arrives, and require both rows to end up written.
 *
 * The doubles come from `test/unit/fake-postgres.ts`: SQL it has not been told about throws,
 * `pact_events` enforces the real foreign key, and BEGIN/COMMIT/ROLLBACK actually roll back.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: vi.fn() }));

vi.mock("@/lib/chain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/chain")>();
  return { ...actual, server: vi.fn(), contractEvents: vi.fn() };
});

import { db } from "@/lib/db";
import { contractEvents, server } from "@/lib/chain";
import { replayDeferred, sync } from "../../lib/indexer";
import { FakeChain, FakePostgres, config, openedEvent, pactA, pactNeverComes, refundEvent, wireFakeIndexing } from "./fake-postgres";

let pg: FakePostgres;
/** The chain, as a ledger range the RPC still keeps. Raised between passes to simulate new ledgers. */
let chain: FakeChain;

beforeEach(() => {
  pg = new FakePostgres();
  chain = new FakeChain();
  wireFakeIndexing(vi.mocked(db), vi.mocked(server), vi.mocked(contractEvents), pg, chain);
});

describe("#51 deferred events", () => {
  it("holds a refund whose pact has not been indexed, then writes both when the pact arrives", async () => {
    // Pass 1: only the vault's refund is on chain. The pact's `opened` event does not exist yet.
    chain.events = [refundEvent(pactA, 1500, "tx-refund-1500")];

    const first = await sync(config);

    expect(first.sources.map((s) => s.source)).toEqual(["pact", "refund_vault:CVAULT"]);
    const vault = first.sources.find((s) => s.source === "refund_vault:CVAULT")!;
    expect(vault).toMatchObject({ indexed: 0, deferred: 1 });
    // Nothing was written, and nothing was silently dropped either.
    expect(pg.pactEvents.size).toBe(0);
    expect(pg.deferred).toHaveLength(1);
    expect(pg.deferred[0]).toMatchObject({ source: "refund_vault:CVAULT", pact_id: pactA, stage: "refunded", ledger: 1500 });
    // The cursor still moved: retention is what saves the event, not a clamp that stalls the vault.
    expect(pg.cursors.get("refund_vault:CVAULT")).toBe(2000);

    // Pass 2: the pact's `opened` event is now readable.
    chain.tip = 3000;
    chain.events = [refundEvent(pactA, 1500, "tx-refund-1500"), openedEvent(pactA, 2500, "tx-open-2500")];

    const second = await sync(config);

    expect(second.replayed).toBe(1);
    expect(second.deferred).toBe(0);
    expect(pg.pacts.has(pactA)).toBe(true);
    expect([...pg.pactEvents].sort()).toEqual([`tx-open-2500|opened|${pactA}`, `tx-refund-1500|refunded|${pactA}`].sort());
    expect(pg.deferred).toHaveLength(0);
    // The replayed refund kept its amount through the JSON round trip.
    expect(pg.pacts.get(pactA)).toMatchObject({ state: "refunded", to_buyer: "1.0000000" });
    // A refund is terminal, so it also produced the receipt the certificate is proved against.
    expect(pg.receipts.size).toBe(1);
  });

  it("keeps indexing a source when a deferred event's pact never arrives", async () => {
    // An M0 refund for a pact the facilitator never reported: the event is held, not allowed to pin the vault.
    chain.events = [refundEvent(pactNeverComes, 1500, "tx-refund-m0")];
    await sync(config);
    expect(pg.deferred).toHaveLength(1);

    chain.tip = 4000;
    chain.events = [refundEvent(pactNeverComes, 1500, "tx-refund-m0"), refundEvent(pactA, 3500, "tx-refund-a")];
    const second = await sync(config);

    // The vault read ledgers past the stuck refund and indexed the new one after it.
    expect(pg.cursors.get("refund_vault:CVAULT")).toBe(4000);
    expect(second.sources.find((s) => s.source === "refund_vault:CVAULT")!.deferred).toBe(1);
    expect(pg.deferred).toHaveLength(2);
    // Two passes, and every pass ends with a replay, so the stuck one has been retried twice.
    expect(pg.deferred.find((r) => r.pact_id === pactNeverComes)?.attempts).toBe(2);
  });

  it("holds the same event once however many passes re-read it", async () => {
    chain.events = [refundEvent(pactA, 1500, "tx-refund-1500")];
    await sync(config);
    // Re-read the same range: the cursor has moved on, so only the replay runs and finds one row.
    chain.tip = 3000;
    await sync(config);

    expect(pg.deferred).toHaveLength(1);
    expect(pg.deferred[0].tx_hash).toBe("tx-refund-1500");
  });

  it("forgets a held event whose row is already indexed, so the table cannot grow forever", async () => {
    chain.events = [refundEvent(pactA, 1500, "tx-refund-1500")];
    await sync(config);
    // Something else wrote the pact and this exact event while it was held.
    pg.pacts.set(pactA, { pact_id: pactA, state: "refunded", cap: "1.0000000", to_seller: "0.0000000", to_buyer: "1.0000000" });
    pg.pactEvents.add(`tx-refund-1500|refunded|${pactA}`);

    const res = await sync(config);

    expect(res.replayed).toBe(1);
    expect(pg.deferred).toHaveLength(0);
  });

  it("leaves a held event held when its replay fails partway through", async () => {
    chain.events = [refundEvent(pactA, 1500, "tx-refund-1500")];
    await sync(config);
    // The pact arrives, but writing the receipt blows up mid-transaction.
    pg.pacts.set(pactA, { pact_id: pactA, state: "funded", cap: "1.0000000", to_seller: "0.0000000", to_buyer: "0.0000000" });
    const attemptsBeforeFailure = pg.deferred[0].attempts;
    pg.failOn = "INSERT INTO receipts";

    await expect(replayDeferred()).rejects.toThrow(/test double is told to fail/);

    // One transaction per event: the event rows that shared the failed transaction are gone too, and the
    // held event is still held with its attempt count unchanged, so the next pass retries it.
    expect(pg.pactEvents.size).toBe(0);
    expect(pg.receipts.size).toBe(0);
    expect(pg.deferred).toHaveLength(1);
    expect(pg.deferred[0].attempts).toBe(attemptsBeforeFailure);
  });
});
