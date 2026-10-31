import { describe, expect, it } from "vitest";
import { nativeToScVal, rpc } from "@stellar/stellar-sdk";
import { contractEvents, paginateContractEvents, type ChainConfig, type RpcEventPage } from "@/lib/chain";

const config: ChainConfig = {
  rpcUrl: "http://127.0.0.1:8000/soroban-testnet",
  networkPassphrase: "Test SDF Network ; Category: testnet",
  pactContractId: "CDEMO",
  receiptAnchorId: "CDEMO",
  refundVaultIds: [],
};

function events(ledger: number, count: number): { id: string; ledger: number }[] {
  return Array.from({ length: count }, (_, i) => ({ id: `${ledger}-${i}`, ledger }));
}

function page(shown: { id: string; ledger: number }[], cursor?: string, latestLedger = 1000): RpcEventPage {
  return {
    // topic/value are real ScVals because paginateContractEvents is what decodes them.
    events: shown.map((e) => ({
      id: e.id,
      ledger: e.ledger,
      txHash: `tx-${e.id}`,
      contractId: "CDEMO",
      topic: [nativeToScVal("pact"), nativeToScVal("opened")],
      value: nativeToScVal({ pact_id: e.id }),
    })),
    latestLedger,
    oldestLedger: 1,
    cursor,
  };
}

/** A scripted RPC that answers each call with the next page and records the cursor it was given. */
function rpcPages(pages: RpcEventPage[]) {
  const asked: (string | undefined)[] = [];
  let i = 0;
  const fetchPage = async (cursor?: string): Promise<RpcEventPage> => {
    asked.push(cursor);
    if (i >= pages.length) throw new Error("scripted RPC ran out of pages — the loop did not stop");
    return pages[i++];
  };
  return { fetchPage, asked };
}

describe("paginateContractEvents", () => {
  it("reads a short page and the empty page that ends the range", async () => {
    const { fetchPage, asked } = rpcPages([page([...events(10, 3), ...events(11, 2)], "c1"), page([], undefined, 1005)]);
    const result = await paginateContractEvents(fetchPage, 10);
    expect(result.events.map((e) => e.id)).toEqual(["10-0", "10-1", "10-2", "11-0", "11-1"]);
    expect(asked).toEqual([undefined, "c1"]);
    // Read to the end of the range, so the cursor may move to the RPC's tip.
    expect(result.throughLedger).toBe(1005);
  });

  // A pass that lags by months must not become one unbounded request storm: it stops at its page
  // budget and says how far it really got, so the cursor cannot mark unread events as read.
  it("stops at its page budget and reports only the ledgers it actually read", async () => {
    const pages = [0, 1, 2, 3].map((n) => page(events(100 + n, 100), `c${n}`, 900));
    const { fetchPage, asked } = rpcPages(pages);
    const result = await paginateContractEvents(fetchPage, 100, 2);
    expect(asked).toEqual([undefined, "c0"]);
    expect(result.events).toHaveLength(200);
    expect(result.throughLedger).toBe(101);
    expect(result.latestLedger).toBe(900);
  });

  // The regression this exists for: the RPC caps a page near 100 whatever limit is asked for, so
  // `events.length < limit` is true in the middle of a busy range. Breaking there loses every later
  // event while the cursor advances past it. These are the page sizes measured live on testnet.
  it("follows the cursor through truncated pages instead of stopping at the first short one", async () => {
    const full = [0, 1, 2, 3].map((n) => page(events(100 + n, 100), `c${n}`));
    const { fetchPage, asked } = rpcPages([...full, page(events(104, 8), "c4"), page([], undefined, 140)]);
    const result = await paginateContractEvents(fetchPage, 100);
    expect(result.events).toHaveLength(408);
    expect(new Set(result.events.map((e) => e.id)).size).toBe(408);
    expect(asked).toEqual([undefined, "c0", "c1", "c2", "c3", "c4"]);
    expect(result).toMatchObject({ latestLedger: 140, oldestLedger: 1 });
  });

  it("de-duplicates an event a page repeats", async () => {
    const overlap = [...events(10, 2), ...events(11, 1)];
    const { fetchPage } = rpcPages([page(overlap, "c1"), page([...overlap, ...events(12, 1)], "c2"), page([], undefined)]);
    const result = await paginateContractEvents(fetchPage, 10);
    expect(result.events.map((e) => e.id)).toEqual(["10-0", "10-1", "11-0", "12-0"]);
  });

  it("stops rather than spinning when the cursor repeats", async () => {
    const stuck = page(events(10, 5), "same");
    await expect(paginateContractEvents(async () => stuck, 10)).rejects.toThrow(/repeated cursor same/);
  });

  it("propagates a failure on a later page instead of returning a partial read", async () => {
    const good = page(events(10, 100), "c1");
    let calls = 0;
    await expect(
      paginateContractEvents(async () => {
        calls++;
        if (calls === 1) return good;
        throw new Error("RPC unreachable");
      }, 10),
    ).rejects.toThrow("RPC unreachable");
  });

  it("decodes topics and value", async () => {
    const { fetchPage } = rpcPages([page(events(10, 1), "c1"), page([], undefined)]);
    const result = await paginateContractEvents(fetchPage, 10);
    expect(result.events[0].topics).toEqual(["pact", "opened"]);
    expect(result.events[0].value).toEqual({ pact_id: "10-0" });
  });

  it("returns an empty read for a range with no events", async () => {
    const { fetchPage, asked } = rpcPages([page([], "c1", 500)]);
    const result = await paginateContractEvents(fetchPage, 400);
    expect(result.events).toEqual([]);
    expect(asked).toEqual([undefined]);
  });
});

describe("contractEvents", () => {
  it("sends startLedger on the first request and the cursor alone afterwards", async () => {
    // A cursor sent *with* a start ledger is ignored: the RPC re-serves page one forever. So the
    // follow-up request must carry the cursor and no start ledger.
    const original = rpc.Server.prototype.getEvents;
    const asked: Record<string, unknown>[] = [];
    rpc.Server.prototype.getEvents = ((params: never) => {
      asked.push(params as unknown as Record<string, unknown>);
      const shown = asked.length === 1 ? events(10, 100) : [];
      return Promise.resolve({
        events: shown.map((e) => ({
          ...e,
          txHash: `tx-${e.id}`,
          contractId: "CDEMO",
          topic: [nativeToScVal("pact")],
          value: nativeToScVal({ pact_id: e.id }),
        })),
        latestLedger: 120,
        oldestLedger: 1,
        cursor: shown.length ? "c1" : undefined,
      });
    }) as unknown as typeof rpc.Server.prototype.getEvents;
    try {
      const result = await contractEvents(config, "CDEMO", 10);
      expect(result.events).toHaveLength(100);
    } finally {
      rpc.Server.prototype.getEvents = original;
    }
    expect(asked).toHaveLength(2);
    expect(asked[0]).toMatchObject({ startLedger: 10 });
    expect(asked[0]).not.toHaveProperty("cursor");
    expect(asked[1]).toMatchObject({ cursor: "c1" });
    expect(asked[1]).not.toHaveProperty("startLedger");
  });
});
