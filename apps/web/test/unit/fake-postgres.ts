/**
 * Test doubles shared by the indexer suites: a transactional, foreign-key-enforcing stand-in for the
 * parts of Postgres the indexer touches, and a ledger range the RPC still keeps.
 *
 * Both are strict on purpose. `FakePostgres` throws on SQL it has not been told about and refuses to
 * insert a `pact_events` row whose pact does not exist — the real `pact_events_pact_id_fkey` — so an
 * indexer test cannot pass by leaning on a catch-all handler. `FakeChain` returns the page size and the
 * oldest ledger it is told to, which is how a source's own gap or a failed read is simulated.
 */
import type { Mock } from "vitest";
import { db } from "@/lib/db";
import type { ChainConfig, RawEvent } from "@/lib/chain";

export const pactA = "a1".repeat(32);
export const pactNeverComes = "b2".repeat(32);
export const buyer = "GAEOWB5ALLANW7LW6H56XNRJJJMJ43NSXQE4QWHP2IL6LNMUBK6Z5CZM";
export const seller = "GCH4CVKGM2ZDPL66AVHIZ4YJS56A7OI6RFM72H336SUEERYCWHOGPQLE";

/** One `pact` contract and one RefundVault, so `sources()` returns exactly two cursors. */
export const config: ChainConfig = {
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
  pactContractId: "CPACT",
  receiptAnchorId: "CANCHOR",
  refundVaultIds: ["CVAULT"],
};

export const refundEvent = (pactId: string, ledger: number, txHash: string): RawEvent => ({
  contractId: "CVAULT",
  ledger,
  txHash,
  id: `led-${ledger}-0`,
  topics: ["refund_event", Buffer.from(pactId, "hex")],
  value: { amount: 10_000_000n, ledger: ledger - 1, recipient: buyer },
});

export const openedEvent = (pactId: string, ledger: number, txHash: string): RawEvent => ({
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

export const toStroops = (decimal: string): bigint => {
  const [whole, frac = ""] = decimal.split(".");
  return BigInt(whole) * 10_000_000n + BigInt((frac + "0000000").slice(0, 7));
};
export const toDecimal = (stroops: bigint): string =>
  `${stroops / 10_000_000n}.${(stroops % 10_000_000n).toString().padStart(7, "0")}`;

export interface PactRow {
  pact_id: string;
  state: string;
  cap: string;
  to_seller: string;
  to_buyer: string;
}
export interface DeferredRow {
  id: number;
  source: string;
  pact_id: string;
  stage: string;
  tx_hash: string;
  ledger: number;
  event: string;
  attempts: number;
}

export class FakePostgres {
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

/** Soroban RPC as a ledger range: a tip that advances between passes, and one contract whose read fails. */
export class FakeChain {
  events: RawEvent[] = [];
  tip = 2000;
  oldestLedger = 1000;
  /** `contractEvents` throws for this contract, the way a timed-out or non-responding RPC would. */
  failReadFor: string | null = null;

  getHealth() {
    return { oldestLedger: this.oldestLedger, latestLedger: this.tip };
  }

  async contractEvents(_config: ChainConfig, contractId: string, startLedger: number) {
    if (this.failReadFor === contractId) throw new Error(`RPC read failed for ${contractId}`);
    return {
      events: this.events.filter((e) => e.contractId === contractId && e.ledger >= startLedger && e.ledger <= this.tip),
      latestLedger: this.tip,
      oldestLedger: this.oldestLedger,
      throughLedger: this.tip,
    };
  }
}

/** Point `@/lib/db` and the chain mocks at a pair of doubles. Call from `beforeEach`. */
export function wireFakeIndexing(
  fakeDb: Mock,
  fakeServer: Mock,
  fakeContractEvents: Mock,
  pg: FakePostgres,
  chain: FakeChain,
): void {
  fakeDb.mockImplementation(
    () =>
      ({
        query: (sql: string, params?: unknown[]) => pg.query(sql, params),
        connect: async () => ({
          query: (sql: string, params?: unknown[]) => pg.query(sql, params),
          release: () => {},
        }),
      }) as unknown as ReturnType<typeof db>,
  );
  fakeServer.mockImplementation(() => ({ getHealth: async () => chain.getHealth() }) as never);
  fakeContractEvents.mockImplementation((c: ChainConfig, contractId: string, startLedger: number) =>
    chain.contractEvents(c, contractId, startLedger),
  );
}
