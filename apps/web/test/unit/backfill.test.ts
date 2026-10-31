import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the db module
vi.mock("@/lib/db", () => {
  return {
    db: vi.fn(),
  };
});

vi.mock("@/lib/chain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/chain")>();
  return {
    ...actual,
    server: vi.fn(),
    contractEvents: vi.fn(),
  };
});

import { db } from "@/lib/db";
import { server, contractEvents, type ChainConfig, type RawEvent } from "@/lib/chain";
import {
  checkLag,
  DEFAULT_RPC_RETENTION,
  backfillSource,
  syncWithHistory,
  type HistorySource,
} from "../../lib/indexer/backfill";
import { sync, OutsideRetentionError } from "../../lib/indexer";

const pactIdHex = "3bff7dfd2a2019a5bc35d23c27335f81e8ed756dcc093ed1fb587abd73c9f276";
const pactIdBytes = Buffer.from(pactIdHex, "hex");

const rawPact = (topics: unknown[], value: unknown, ledger: number, txHash: string): RawEvent => ({
  contractId: "CPACT",
  ledger,
  txHash,
  id: `id-${ledger}`,
  topics,
  value,
});

describe("Indexer backfill & lag alert (ROADMAP S-03)", () => {
  const cursors = new Map<string, number>();
  const pacts = new Map<string, Record<string, unknown>>();
  const pactEvents = new Set<string>();
  const verdicts = new Set<string>();
  const receipts = new Set<string>();

  const config: ChainConfig = {
    networkPassphrase: "Test SDF Network ; September 2015",
    rpcUrl: "https://soroban-testnet.stellar.org",
    pactContractId: "CPACT",
    receiptAnchorId: "CANCHOR",
    refundVaultIds: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    cursors.clear();
    pacts.clear();
    pactEvents.clear();
    verdicts.clear();
    receipts.clear();

    const mockQuery = vi.fn(async (sql: string, params?: unknown[]) => {
      // sync_state cursor
      if (sql.includes("SELECT cursor_ledger FROM sync_state")) {
        const source = params?.[0] as string;
        const val = cursors.get(source);
        return { rows: val !== undefined ? [{ cursor_ledger: val }] : [] };
      }
      if (sql.includes("INSERT INTO sync_state")) {
        const source = params?.[0] as string;
        const ledger = Number(params?.[1]);
        const existing = cursors.get(source) ?? 0;
        cursors.set(source, Math.max(existing, ledger));
        return { rows: [], rowCount: 1 };
      }
      // pacts
      if (sql.includes("SELECT 1 FROM pacts WHERE pact_id = $1")) {
        const id = params?.[0] as string;
        return { rows: pacts.has(id) ? [{ 1: 1 }] : [], rowCount: pacts.has(id) ? 1 : 0 };
      }
      if (sql.includes("INSERT INTO pacts")) {
        const id = params?.[0] as string;
        pacts.set(id, { id });
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("UPDATE pacts SET state")) {
        const id = params?.[0] as string;
        if (pacts.has(id)) {
          pacts.set(id, { ...pacts.get(id), state: params?.[1] });
        }
        return { rows: [], rowCount: 1 };
      }
      // pact_events
      if (sql.includes("INSERT INTO pact_events")) {
        const key = `${params?.[2]}-${params?.[1]}-${params?.[0]}`;
        if (pactEvents.has(key)) return { rows: [], rowCount: 0 };
        pactEvents.add(key);
        return { rows: [], rowCount: 1 };
      }
      // verdicts
      if (sql.includes("INSERT INTO verdicts")) {
        verdicts.add(params?.[0] as string);
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("SELECT envelope_hash FROM verdicts")) {
        return { rows: [{ envelope_hash: "0101010101010101010101010101010101010101010101010101010101010101" }] };
      }
      // receipts
      if (sql.includes("INSERT INTO receipts")) {
        receipts.add(params?.[0] as string);
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });

    vi.mocked(db).mockReturnValue({
      query: mockQuery,
      connect: async () => ({
        query: mockQuery,
        release: () => {},
      }),
    } as unknown as ReturnType<typeof db>);
  });

  describe("checkLag", () => {
    it("reports healthy when lag is below 50% retention", () => {
      const status = checkLag("pact", 50000000, 50001000, DEFAULT_RPC_RETENTION);
      expect(status.lag).toBe(1000);
      expect(status.alertTriggered).toBe(false);
      expect(status.outsideRetention).toBe(false);
    });

    it("triggers alert when lag reaches 50% of retention threshold", () => {
      const halfRetention = Math.floor(DEFAULT_RPC_RETENTION * 0.5);
      const status = checkLag("pact", 50000000, 50000000 + halfRetention, DEFAULT_RPC_RETENTION);
      expect(status.lag).toBe(halfRetention);
      expect(status.alertTriggered).toBe(true);
      expect(status.outsideRetention).toBe(false);
    });

    it("reports outside retention when lag exceeds retention", () => {
      const status = checkLag("pact", 50000000, 50000000 + DEFAULT_RPC_RETENTION + 10, DEFAULT_RPC_RETENTION);
      expect(status.alertTriggered).toBe(true);
      expect(status.outsideRetention).toBe(true);
    });
  });

  describe("backfillSource", () => {
    it("never advances cursor past ledgers that weren't read", async () => {
      const mockHistory: HistorySource = {
        fetchEvents: vi.fn().mockResolvedValue({
          events: [],
          scannedThroughLedger: 12000, // Scanned only up to 12000 of requested 20000
        }),
      };

      cursors.set("pact", 10000);
      const res = await backfillSource({ name: "pact", contractId: "CPACT" }, 10000, 20000, mockHistory, 50000);

      expect(res.indexed).toBe(0);
      // The cursor must only advance to 12000 (what was actually scanned), NOT 20000
      expect(cursors.get("pact")).toBe(12000);
    });
  });

  describe("HttpHistorySource", () => {
    it("decodes base64-XDR events into the bytes the decoders expect", async () => {
      const { HttpHistorySource } = await import("../../lib/indexer/backfill");
      const { nativeToScVal, xdr } = await import("@stellar/stellar-sdk");
      const value = xdr.ScVal.scvMap([
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("pact_id"), val: xdr.ScVal.scvBytes(pactIdBytes) }),
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("to_buyer"), val: nativeToScVal(10_000_000n, { type: "i128" }) }),
      ]);
      const wire = {
        contractId: "CPACT",
        ledger: 15000,
        txHash: "tx",
        id: "1",
        topic: [xdr.ScVal.scvSymbol("pact").toXDR("base64"), xdr.ScVal.scvSymbol("released").toXDR("base64")],
        value: value.toXDR("base64"),
      };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ events: [wire], scannedThroughLedger: 20000 })),
      );
      try {
        const out = await new HttpHistorySource("https://history.example/events").fetchEvents("CPACT", 10000, 20000);
        expect(out.scannedThroughLedger).toBe(20000);
        const { decodePactEvent } = await import("../../lib/indexer/sources");
        expect(decodePactEvent(out.events[0]!)).toMatchObject({ stage: "released", pactId: pactIdHex, toBuyer: "10000000" });
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it("refuses a response that doesn't say how far it scanned", async () => {
      const { HttpHistorySource } = await import("../../lib/indexer/backfill");
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ events: [] })));
      try {
        await expect(new HttpHistorySource("https://history.example/events").fetchEvents("CPACT", 1, 2)).rejects.toThrow(/scannedThroughLedger/);
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });

  describe("End-to-end backfill and resume from RPC", () => {
    it("starts with cursor outside retention and ends with every event indexed and none skipped", async () => {
      // 1. Setup: cursor is at 10000, RPC retention window is [50000, 51000].
      // Lag is 41000 > DEFAULT_RPC_RETENTION (17280).
      cursors.set("pact", 10000);
      const lagStatus = checkLag("pact", 10000, 51000);
      expect(lagStatus.alertTriggered).toBe(true);
      expect(lagStatus.outsideRetention).toBe(true);

      const mockGetHealth = vi.fn().mockResolvedValue({
        oldestLedger: 50000,
        latestLedger: 51000,
      });
      vi.mocked(server).mockReturnValue({
        getHealth: mockGetHealth,
      } as unknown as ReturnType<typeof server>);

      // 2. Direct sync() fails closed with OutsideRetentionError instead of silently skipping 40,000 ledgers
      await expect(sync(config)).rejects.toThrow(OutsideRetentionError);
      expect(pacts.size).toBe(0);

      // 3. Prepare historical events that occurred in the gap (10000..50000)
      const historicalEvents: RawEvent[] = [
        rawPact(
          ["pact", "opened"],
          {
            pact_id: pactIdBytes,
            buyer: "GAEOWB5ALLANW7LW6H56XNRJJJMJ43NSXQE4QWHP2IL6LNMUBK6Z5CZM",
            seller: "GCH4CVKGM2ZDPL66AVHIZ4YJS56A7OI6RFM72H336SUEERYCWHOGPQLE",
            cap: 10_000_000n,
            condition_hash: Buffer.alloc(32, 0xc7),
            metered: false,
            silence: 1,
            verdict_deadline: 20000,
            settle_deadline: 30000,
          },
          15000,
          "tx-open-15000",
        ),
        rawPact(
          ["pact", "verdict"],
          {
            pact_id: pactIdBytes,
            verdict: 1,
            amount: 10_000_000n,
            envelope_hash: Buffer.alloc(32, 1),
          },
          25000,
          "tx-verdict-25000",
        ),
        rawPact(
          ["pact", "settled"],
          {
            pact_id: pactIdBytes,
            to_seller: 10_000_000n,
            to_buyer: 0n,
          },
          35000,
          "tx-settle-35000",
        ),
      ];

      // Like a real source: only the events in the requested range, and how far it scanned.
      const historySource: HistorySource = {
        fetchEvents: vi.fn(async (_c: string, from: number, to: number) => ({
          events: historicalEvents.filter((e) => e.ledger >= from && e.ledger <= to),
          scannedThroughLedger: to,
        })),
      };

      // 4. Prepare RPC events in retention window (50000..51000)
      const rpcPactIdHex = "4cff7dfd2a2019a5bc35d23c27335f81e8ed756dcc093ed1fb587abd73c9f277";
      const rpcPactIdBytes = Buffer.from(rpcPactIdHex, "hex");
      const rpcEvents: RawEvent[] = [
        rawPact(
          ["pact", "opened"],
          {
            pact_id: rpcPactIdBytes,
            buyer: "GAEOWB5ALLANW7LW6H56XNRJJJMJ43NSXQE4QWHP2IL6LNMUBK6Z5CZM",
            seller: "GCH4CVKGM2ZDPL66AVHIZ4YJS56A7OI6RFM72H336SUEERYCWHOGPQLE",
            cap: 5_000_000n,
            condition_hash: Buffer.alloc(32, 0xd8),
            metered: false,
            silence: 1,
            verdict_deadline: 60000,
            settle_deadline: 70000,
          },
          50500,
          "tx-open-50500",
        ),
      ];

      vi.mocked(contractEvents).mockResolvedValue({
        events: rpcEvents,
        latestLedger: 51000,
        oldestLedger: 50000,
        // The mock read every page, so this pass covers the whole window.
        throughLedger: 51000,
      });

      // 5. Run syncWithHistory: backfills the historical gap, then resumes RPC sync
      const { backfillResults, syncResults } = await syncWithHistory({ historySource, config });

      // Verify backfill indexed all 3 historical events and skipped 0
      expect(backfillResults).toHaveLength(1);
      expect(backfillResults[0].fromLedger).toBe(10000);
      expect(backfillResults[0].toLedger).toBe(50000);
      expect(backfillResults[0].indexed).toBe(3);
      expect(backfillResults[0].skipped).toBe(0);

      // Verify RPC sync indexed 1 event and skipped 0
      expect(syncResults).toHaveLength(1);
      expect(syncResults[0].fromLedger).toBe(50000);
      expect(syncResults[0].toLedger).toBe(51000);
      expect(syncResults[0].indexed).toBe(1);
      expect(syncResults[0].skipped).toBe(0);

      // Verify final state: both pacts indexed, terminal receipt created, cursor at 51000
      expect(pacts.has(pactIdHex)).toBe(true);
      expect(pacts.has(rpcPactIdHex)).toBe(true);
      expect(pactEvents.size).toBe(4);
      expect(receipts.size).toBe(1); // One terminal transition (settled)
      expect(cursors.get("pact")).toBe(51000);
    });
  });
});
