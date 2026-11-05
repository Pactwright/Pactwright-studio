/**
 * #51: an event whose pact row does not exist yet is retained and replayed, never dropped.
 *
 * `pact_events.pact_id` references `pacts`, so a refund that arrives before its pact's `opened` event —
 * or for an M0 pact the facilitator has not reported — cannot be written. The old indexer counted it as
 * skipped and advanced the source's cursor past it, losing it for good. These tests run a pass where the
 * refund comes first and a second pass where the pact arrives, and require both rows to end up written.
 *
 * The database double is strict on purpose: SQL it has not been told about throws, `pact_events` enforces
 * the real foreign key, and BEGIN/COMMIT/ROLLBACK actually roll back. A test here cannot pass by leaning
 * on a catch-all handler.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: vi.fn() }));

vi.mock("@/lib/chain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/chain")>();
  return { ...actual, server: vi.fn(), contractEvents: vi.fn() };
});

import { db } from "@/lib/db";
import { contractEvents, server, type ChainConfig, type RawEvent } from "@/lib/chain";
import { replayDeferred, sync } from "../../lib/indexer";

const pactA = "a1".repeat(32);
const pactNeverComes = "b2".repeat(32);
const buyer = "GAEOWB5ALLANW7LW6H56XNRJJJMJ43NSXQE4QWHP2IL6LNMUBK6Z5CZM";
const seller = "GCH4CVKGM2ZDPL66AVHIZ4YJS56A7OI6RFM72H336SUEERYCWHOGPQLE";

const config: ChainConfig = {
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
  pactContractId: "CPACT",
  receiptAnchorId: "CANCHOR",
  refundVaultIds: ["CVAULT"],
};

const refundEvent = (pactId: string, ledger: number, txHash: string): RawEvent => ({
  contractId: "CVAULT",
  ledger,
  txHash,
  id: `led-${ledger}-0`,
  topics: ["refund_event", Buffer.from(pactId, "hex")],
  value: { amount: 10_000_000n, ledger: ledger - 1, recipient: buyer },
});

const openedEvent = (pactId: string, ledger: number, txHash: string): RawEvent => ({
  contractId: "CPACT",
  ledger,
  txHash,
  id: `led-${ledger}-0`,
  topics: ["pact", "opened"],
  value: {
    pact_id: Buffer.from(pactId, "hex"),
    buyer,
    seller,
    cap: 10_000_000n,
    condition_hash: Buffer.alloc(32, 0xc7),
    metered: false,
    silence: 1,
    verdict_deadline: ledger + 120,
    settle_deadline: ledger + 720,
  },
});

const toStroops = (decimal: string): bigint => {
  const [whole, frac = ""] = decimal.split(".");
  return BigInt(whole) * 10_000_000n + BigInt((frac + "0000000").slice(0, 7));
};
const toDecimal = (stroops: bigint): string =>
  `${stroops / 10_000_000n}.${(stroops % 10_000_000n).toString().padStart(7, "0")}`;

interface PactRow {
  pact_id: string;
  state: string;
  cap: string;
  to_seller: string;
  to_buyer: string;
}
interface DeferredRow {
  id: number;
  source: string;
  pact_id: string;
  stage: string;
  tx_hash: string;
  ledger: number;
  event: string;
  attempts: number;
}

/** A transactional, foreign-key-enforcing stand-in for the parts of Postgres the indexer touches. */
class FakePostgres {
  pacts = new Map<string, PactRow>();
  pactEvents = new Set<string>(); // tx_hash|stage|pact_id, the unique key
  verdicts = new Map<string, { pact_id: string; milestone: string }>();
  receipts = new Set<string>();
  cursors = new Map<string, number>();
  deferred: DeferredRow[] = [];

  private nextDeferredId = 1;
  private open: ReturnType<FakePostgres["snapshot"]> | null = null;
  /** Set to make the statement matching this fragment fail, the way a constraint or a driver would. */
  failOn: string | null = null;

  snapshot() {
    return {
      pacts: new Map([...this.pacts].map(([k, v]) => [k, { ...v }])),
      pactEvents: new Set(this.pactEvents),
      verdicts: new Map(this.verdicts),
      receipts: new Set(this.receipts),
      cursors: new Map(this.cursors),
      deferred: this.deferred.map((r) => ({ ...r })),
      nextDeferredId: this.nextDeferredId,
    };
  }

  async query(sql: string, params: unknown[] = []): Promise<{ rows: Record<string, unknown>[]; rowCount: number }> {
    if (this.failOn && sql.includes(this.failOn)) throw new Error(`test double is told to fail: ${this.failOn}`);
    const p = params as never[];
    const rows = (r: Record<string, unknown>[]) => ({ rows: r, rowCount: r.length });
    const none = { rows: [] as Record<string, unknown>[], rowCount: 0 };

    if (/^\s*(BEGIN|COMMIT|ROLLBACK)/i.test(sql)) {
      if (/BEGIN/i.test(sql)) this.open = this.snapshot();
      else if (this.open) {
        if (/ROLLBACK/i.test(sql)) this.restore(this.open);
        this.open = null;
      }
      return none;
    }

    if (sql.includes("SELECT cursor_ledger FROM sync_state")) {
      const v = this.cursors.get(p[0] as string);
      return rows(v === undefined ? [] : [{ cursor_ledger: v }]);
    }
    if (sql.includes("INSERT INTO sync_state")) {
      const [source, ledger] = [p[0] as string, Number(p[1])];
      this.cursors.set(source, Math.max(this.cursors.get(source) ?? 0, ledger)); // GREATEST
      return none;
    }

    if (sql.includes("SELECT 1 FROM pacts WHERE pact_id = $1")) {
      return rows(this.pacts.has(p[0] as string) ? [{ "?column?": 1 }] : []);
    }
    if (sql.includes("INSERT INTO pacts")) {
      const pact_id = p[0] as string;
      if (this.pacts.has(pact_id)) return none; // ON CONFLICT DO NOTHING
      const cap = p[3] as string;
      if (toStroops(cap) <= 0n) throw new Error('null value in column "cap" violates check constraint "pacts_cap_check"');
      this.pacts.set(pact_id, { pact_id, state: "funded", cap, to_seller: "0.0000000", to_buyer: "0.0000000" });
      return rows([{}]);
    }
    if (sql.includes("UPDATE pacts SET state")) {
      const [pact_id, state, toSeller, toBuyer, isRefund] = [
        p[0] as string,
        p[1] as string,
        p[2] as string | null,
        p[3] as string | null,
        p[4] as boolean,
      ];
      const existing = this.pacts.get(pact_id);
      if (!existing) return none; // UPDATE matches nothing; it is not an error
      this.pacts.set(pact_id, {
        ...existing,
        state,
        to_seller: isRefund || toSeller === null ? existing.to_seller : toSeller,
        to_buyer: isRefund
          ? toDecimal(toStroops(existing.to_buyer) + BigInt(toBuyer === null ? 0 : toStroops(toBuyer)))
          : (toBuyer ?? existing.to_buyer),
      });
      return rows([{}]);
    }

    if (sql.includes("INSERT INTO deferred_events")) {
      const source = String(p[0]);
      const pact_id = String(p[1]);
      const stage = String(p[2]);
      const tx_hash = String(p[3]);
      const ledger = Number(p[4]);
      const event = String(p[5]);
      if (this.deferred.some((r) => r.tx_hash === tx_hash && r.stage === stage && r.pact_id === pact_id)) return none;
      this.deferred.push({ id: this.nextDeferredId++, source, pact_id, stage, tx_hash, ledger, event, attempts: 0 });
      return rows([{}]);
    }
    if (sql.includes("SELECT id, event FROM deferred_events")) {
      const limit = Number(p[0]);
      return rows(
        [...this.deferred]
          .sort((a, b) => a.ledger - b.ledger || a.id - b.id)
          .slice(0, limit)
          .map((r) => ({ id: r.id, event: JSON.parse(r.event) })),
      );
    }
    if (sql.includes("DELETE FROM deferred_events WHERE id = $1")) {
      const before = this.deferred.length;
      this.deferred = this.deferred.filter((r) => r.id !== Number(p[0]));
      return rows(Array.from({ length: before - this.deferred.length }, () => ({})));
    }
    if (sql.includes("UPDATE deferred_events SET attempts")) {
      const row = this.deferred.find((r) => r.id === Number(p[0]));
      if (!row) return none;
      row.attempts += 1;
      return rows([{}]);
    }
    if (sql.includes("SELECT count(*) AS n FROM deferred_events")) {
      return rows([{ n: String(this.deferred.length) }]);
    }

    if (sql.includes("INSERT INTO pact_events")) {
      const [pact_id, stage, tx_hash] = [p[0] as string, p[1] as string, p[2] as string];
      // The real constraint: without this, the whole point of the test is lost.
      if (!this.pacts.has(pact_id)) {
        throw new Error(`insert or update on table "pact_events" violates foreign key constraint "pact_events_pact_id_fkey"`);
      }
      const key = `${tx_hash}|${stage}|${pact_id}`;
      if (this.pactEvents.has(key)) return none;
      this.pactEvents.add(key);
      return rows([{}]);
    }

    if (sql.includes("INSERT INTO verdicts")) {
      const [envelope_hash, pact_id] = [p[0] as string, p[1] as string];
      if (!this.verdicts.has(envelope_hash)) this.verdicts.set(envelope_hash, { pact_id, milestone: "delivery" });
      return rows([{}]);
    }
    if (sql.includes("SELECT envelope_hash FROM verdicts")) {
      const pact_id = p[0] as string;
      return rows([...this.verdicts].filter(([, v]) => v.pact_id === pact_id).map(([k]) => ({ envelope_hash: k })));
    }

    if (sql.includes("INSERT INTO receipts")) {
      const leaf = p[0] as string;
      if (this.receipts.has(leaf)) return none;
      this.receipts.add(leaf);
      return rows([{}]);
    }

    throw new Error(`test double has no handler for: ${sql.replace(/\s+/g, " ").trim()}`);
  }

  restore(s: ReturnType<FakePostgres["snapshot"]>) {
    this.pacts = s.pacts;
    this.pactEvents = s.pactEvents;
    this.verdicts = s.verdicts;
    this.receipts = s.receipts;
    this.cursors = s.cursors;
    this.deferred = s.deferred;
    this.nextDeferredId = s.nextDeferredId;
  }
}

let pg: FakePostgres;
/** The chain, as a ledger range the RPC still keeps. Raised between passes to simulate new ledgers. */
let chain: RawEvent[];
let tip = 2000;

beforeEach(() => {
  pg = new FakePostgres();
  chain = [];
  tip = 2000;
  vi.mocked(db).mockImplementation(
    () =>
      ({
        query: (sql: string, params?: unknown[]) => pg.query(sql, params),
        connect: async () => ({
          query: (sql: string, params?: unknown[]) => pg.query(sql, params),
          release: () => {},
        }),
      }) as unknown as ReturnType<typeof db>,
  );
  vi.mocked(server).mockImplementation(() => ({ getHealth: async () => ({ oldestLedger: 1000, latestLedger: tip }) }) as never);
  vi.mocked(contractEvents).mockImplementation(async (_c: ChainConfig, contractId: string, startLedger: number) => ({
    events: chain.filter((e) => e.contractId === contractId && e.ledger >= startLedger && e.ledger <= tip),
    latestLedger: tip,
    oldestLedger: 1000,
    throughLedger: tip,
  }));
});

describe("#51 deferred events", () => {
  it("holds a refund whose pact has not been indexed, then writes both when the pact arrives", async () => {
    // Pass 1: only the vault's refund is on chain. The pact's `opened` event does not exist yet.
    chain = [refundEvent(pactA, 1500, "tx-refund-1500")];

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
    tip = 3000;
    chain = [refundEvent(pactA, 1500, "tx-refund-1500"), openedEvent(pactA, 2500, "tx-open-2500")];

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
    chain = [refundEvent(pactNeverComes, 1500, "tx-refund-m0")];
    await sync(config);
    expect(pg.deferred).toHaveLength(1);

    tip = 4000;
    chain = [refundEvent(pactNeverComes, 1500, "tx-refund-m0"), refundEvent(pactA, 3500, "tx-refund-a")];
    const second = await sync(config);

    // The vault read ledgers past the stuck refund and indexed the new one after it.
    expect(pg.cursors.get("refund_vault:CVAULT")).toBe(4000);
    expect(second.sources.find((s) => s.source === "refund_vault:CVAULT")!.deferred).toBe(1);
    expect(pg.deferred).toHaveLength(2);
    // Two passes, and every pass ends with a replay, so the stuck one has been retried twice.
    expect(pg.deferred.find((r) => r.pact_id === pactNeverComes)?.attempts).toBe(2);
  });

  it("holds the same event once however many passes re-read it", async () => {
    chain = [refundEvent(pactA, 1500, "tx-refund-1500")];
    await sync(config);
    // Re-read the same range: the cursor has moved on, so only the replay runs and finds one row.
    tip = 3000;
    await sync(config);

    expect(pg.deferred).toHaveLength(1);
    expect(pg.deferred[0].tx_hash).toBe("tx-refund-1500");
  });

  it("forgets a held event whose row is already indexed, so the table cannot grow forever", async () => {
    chain = [refundEvent(pactA, 1500, "tx-refund-1500")];
    await sync(config);
    // Something else wrote the pact and this exact event while it was held.
    pg.pacts.set(pactA, { pact_id: pactA, state: "refunded", cap: "1.0000000", to_seller: "0.0000000", to_buyer: "1.0000000" });
    pg.pactEvents.add(`tx-refund-1500|refunded|${pactA}`);

    const res = await sync(config);

    expect(res.replayed).toBe(1);
    expect(pg.deferred).toHaveLength(0);
  });

  it("leaves a held event held when its replay fails partway through", async () => {
    chain = [refundEvent(pactA, 1500, "tx-refund-1500")];
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
