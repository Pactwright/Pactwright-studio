import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the db module
vi.mock("@/lib/db", () => {
  return {
    db: vi.fn(),
  };
});

import { db } from "@/lib/db";
import { getPactById } from "../../lib/pacts";
import { getCertificateById } from "../../lib/certificates";

describe("API data models & queries", () => {
  const mockQuery = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RECEIPT_ANCHOR_ID = "CAEO5GBC3ULRC5RYBSCSOXLNXHU2HZAHNW5HY5LZM3DIPFMX357ILNJ2";
    vi.mocked(db).mockReturnValue({
      query: mockQuery,
    } as unknown as ReturnType<typeof db>);
  });

  describe("getPactById", () => {
    it("returns null when pact does not exist", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await getPactById("nonexistent");
      expect(res).toBeNull();
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it("returns pact and its timeline events when found", async () => {
      const mockPact = {
        pact_id: "1111111111111111111111111111111111111111111111111111111111111111",
        mode: "escrow",
        buyer: "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVWGS",
        seller: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
        resource_url: "https://api.pactwright.dev/data/weather",
        cap: "10.0000000",
        condition_hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        condition: { type: "http-match" },
        metered: false,
        silence: "refund",
        state: "settled",
        verdict_deadline: 50000000,
        settle_deadline: 50001000,
        to_seller: "10.0000000",
        to_buyer: "0.0000000",
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockEvents = [
        {
          id: 1,
          pact_id: mockPact.pact_id,
          stage: "opened",
          tx_hash: "tx_open",
          ledger: 50000000,
          data: {},
        },
      ];

      mockQuery
        .mockResolvedValueOnce({ rows: [mockPact] })
        .mockResolvedValueOnce({ rows: mockEvents });

      const res = await getPactById(mockPact.pact_id);
      expect(res).not.toBeNull();
      expect(res?.pact.pact_id).toBe(mockPact.pact_id);
      expect(res?.events).toHaveLength(1);
      expect(res?.events[0].stage).toBe("opened");
    });
  });

  describe("getCertificateById", () => {
    it("returns null when receipt is not found", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const cert = await getCertificateById("notfound");
      expect(cert).toBeNull();
    });

    it("formats anchored certificate matching CertificateSchema", async () => {
      const mockReceiptRow = {
        leaf: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        pact_id: "1111111111111111111111111111111111111111111111111111111111111111",
        transition: "settled",
        batch_id: "1",
        proof: ["dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"],
        to_seller: "10.0000000",
        to_buyer: "0.0000000",
        to_seller_stroops: "100000000",
        to_buyer_stroops: "0",
        ledger: 600,
        root: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
        anchor_tx: "tx_anchor_1",
        envelope_hash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      };

      const mockTxs = [
        { stage: "opened", tx_hash: "tx_open" },
        { stage: "settled", tx_hash: "tx_settle" },
      ];

      mockQuery
        .mockResolvedValueOnce({ rows: [mockReceiptRow] })
        .mockResolvedValueOnce({ rows: mockTxs });

      const cert = await getCertificateById(mockReceiptRow.pact_id);
      expect(cert).not.toBeNull();
      expect(cert?.status).toBe("anchored");
      expect(cert?.pactId).toBe(mockReceiptRow.pact_id);
      expect(cert?.transition).toBe("settled");
      expect(cert?.toSeller).toBe("10.0000000");
      expect(cert?.toBuyer).toBe("0.0000000");
      expect(cert?.leaf).toBe(mockReceiptRow.leaf);
      expect(cert?.root).toBe(mockReceiptRow.root);
      expect(cert?.batchId).toBe(1);
      expect(cert?.proof).toEqual(mockReceiptRow.proof);
      expect(cert?.leafInput).toMatchObject({ toSellerStroops: "100000000", ledger: 600 });
      expect(cert?.txs).toHaveLength(2);
    });

    it("formats pending certificate when unanchored", async () => {
      const mockPendingRow = {
        leaf: "3333333333333333333333333333333333333333333333333333333333333333",
        pact_id: "3333333333333333333333333333333333333333333333333333333333333333",
        transition: "refunded",
        batch_id: null,
        proof: null,
        to_seller: "0.0000000",
        to_buyer: "2.5000000",
        to_seller_stroops: "0",
        to_buyer_stroops: "25000000",
        ledger: 700,
        root: null,
        anchor_tx: null,
        envelope_hash: null,
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [mockPendingRow] })
        .mockResolvedValueOnce({ rows: [] });

      const cert = await getCertificateById(mockPendingRow.pact_id);
      expect(cert).not.toBeNull();
      expect(cert?.status).toBe("pending");
      expect(cert?.root).toBeUndefined();
      expect(cert?.proof).toBeUndefined();
      expect(cert?.batchId).toBeUndefined();
    });
  });
});
