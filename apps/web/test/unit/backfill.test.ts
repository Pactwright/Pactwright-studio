import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the db module
vi.mock("@/lib/db", () => {
  return {
    db: vi.fn(),
  };
});

import { db } from "@/lib/db";
import { checkLag, DEFAULT_RPC_RETENTION } from "../../lib/indexer/backfill";

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

});
