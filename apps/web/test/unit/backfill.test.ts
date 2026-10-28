import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the db module
vi.mock("@/lib/db", () => {
  return {
    db: vi.fn(),
  };
});

import { db } from "@/lib/db";
import { checkLag, backfill, DEFAULT_RPC_RETENTION } from "../../lib/indexer/backfill";
import { decodePactEvent } from "../../lib/indexer/sources";

describe("Indexer backfill & lag alert (ROADMAP S-03)", () => {
  const mockQuery = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db).mockReturnValue({
      query: mockQuery,
    } as unknown as ReturnType<typeof db>);
    mockQuery.mockResolvedValue({ rows: [] });
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

  describe("backfill gap filling", () => {
    it("fills a simulated history gap and advances cursor", async () => {
      const pactId = "1111111111111111111111111111111111111111111111111111111111111111";
      const simulatedEv = decodePactEvent({
        topic: "opened",
        txHash: "0xsimulated_gap_fill",
        ledger: 49000000,
        payload: {
          pactId,
          buyer: "GA7Q",
          seller: "GBBD",
          resourceUrl: "https://api.pactwright.dev/gap",
          cap: "10.0000000",
          conditionHash: "gap_hash",
        },
      })!;

      mockQuery.mockResolvedValueOnce({ rows: [{ cursor_ledger: 48999000 }] }); // getCursor

      const result = await backfill("pact", 48999000, 49000500, {
        simulatedEvents: [simulatedEv],
        retention: DEFAULT_RPC_RETENTION,
      });

      expect(result.backfilledCount).toBe(1);
      expect(result.toLedger).toBe(49000500);
      expect(mockQuery).toHaveBeenCalled();
    });
  });
});
