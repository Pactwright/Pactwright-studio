/**
 * Live proof of the indexer's `getEvents` paging against the testnet RPC. Read-only: it asks the
 * public RPC for events and sends nothing. Run with `pnpm live:testnet`.
 *
 * ROADMAP S-02. The bug this pins: the RPC caps a page near 100 events however many the client asks
 * for, so `events.length < limit` is true in the *middle* of a busy range — breaking there loses
 * every later event while the cursor advances past it.
 */
import { describe, expect, it } from "vitest";
import { chainConfig, contractEvents, server, type ChainConfig } from "@/lib/chain";

/** The testnet Stellar asset contract: hundreds of events per few ledgers, so pages truncate. */
const BUSY_CONTRACT = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const enabled = process.env.STELLAR_RPC_URL?.trim() !== "";
let config: ChainConfig;

describe.skipIf(!enabled)("getEvents paging on the live RPC", () => {
  it("answers one request with a page of its own choosing", async () => {
    config = chainConfig();
    const health = await server(config).getHealth();
    const single = await server(config).getEvents({
      filters: [{ type: "contract", contractIds: [BUSY_CONTRACT] }],
      startLedger: health.latestLedger - 20,
      limit: 200,
    });
    console.log(`one request (limit 200): ${single.events.length} events, cursor ${single.cursor}`);
    expect(single.events.length).toBeGreaterThan(0);
    // The count a page carries is the RPC's choice: the same request measured 100 and 200 on 2026-10-31.
    expect(single.events.length).toBeLessThanOrEqual(200);
  }, 120_000);

  it("pages the same window to the end, and finds more than that single page", async () => {
    config ??= chainConfig();
    const health = await server(config).getHealth();
    const from = health.latestLedger - 20;
    const single = await server(config).getEvents({
      filters: [{ type: "contract", contractIds: [BUSY_CONTRACT] }],
      startLedger: from,
      limit: 200,
    });
    const paged = await contractEvents(config, BUSY_CONTRACT, from);
    const ids = paged.events.map((e) => e.id);
    const span = ids.length ? paged.events.at(-1)!.ledger - from + 1 : 0;
    console.log(`paged from ${from} to ${paged.latestLedger}: ${ids.length} events over ${span} ledgers`);

    // One page is what the old loop treated as the whole range; paging has to beat it whenever that
    // page was cut off, which is the case whenever it came back full.
    expect(ids.length).toBeGreaterThanOrEqual(single.events.length);
    if (single.events.length === 200) expect(ids.length).toBeGreaterThan(single.events.length);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...ids].sort());
    expect(paged.events.every((e) => e.ledger >= from)).toBe(true);
    expect(paged.oldestLedger).toBeLessThanOrEqual(from);
  }, 180_000);
});
