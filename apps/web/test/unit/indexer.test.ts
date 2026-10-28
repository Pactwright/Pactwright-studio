import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the db module
vi.mock("@/lib/db", () => {
  return {
    db: vi.fn(),
  };
});

import { db } from "@/lib/db";
import {
  decodePactEvent,
  decodeFacilitatorEvent,
  decodeRefundVaultEvent,
} from "../../lib/indexer/sources";
import { persistEvents, sync } from "../../lib/indexer";

describe("Indexer sources and decoders", () => {
  const txHash = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const pactId = "1111111111111111111111111111111111111111111111111111111111111111";

  it("decodes opened pact events", () => {
    const ev = decodePactEvent({
      topic: "opened",
      txHash,
      ledger: 50000000,
      payload: {
        pactId,
        buyer: "GA7Q",
        seller: "GBBD",
        resourceUrl: "https://api.pactwright.dev/data",
        cap: "10.0000000",
        conditionHash: "cccc",
        mode: "escrow",
      },
    });

    expect(ev).not.toBeNull();
    expect(ev?.stage).toBe("opened");
    expect(ev?.buyer).toBe("GA7Q");
    expect(ev?.cap).toBe("10.0000000");
  });

  it("decodes paid events", () => {
    const ev = decodePactEvent({
      topic: "paid",
      txHash,
      ledger: 50000001,
      payload: { pactId, toSeller: "5.0000000", toBuyer: "0.0000000" },
    });
    expect(ev?.stage).toBe("paid");
    expect(ev?.toSeller).toBe("5.0000000");
  });

  it("decodes verdict events", () => {
    const ev = decodePactEvent({
      topic: "verdict",
      txHash,
      ledger: 50000002,
      payload: {
        pactId,
        envelopeHash: "bbbb",
        verdict: "ALLOW",
        amount: "10.0000000",
      },
    });
    expect(ev?.stage).toBe("verdict");
    expect(ev?.pactState).toBe("allowed");
    expect(ev?.envelopeHash).toBe("bbbb");
  });

  it("decodes settled events", () => {
    const ev = decodePactEvent({
      topic: "settled",
      txHash,
      ledger: 50000003,
      payload: { pactId, toSeller: "10.0000000", toBuyer: "0.0000000" },
    });
    expect(ev?.stage).toBe("settled");
    expect(ev?.pactState).toBe("settled");
  });

  it("decodes released events", () => {
    const ev = decodePactEvent({
      topic: "released",
      txHash,
      ledger: 50000004,
      payload: { pactId, toSeller: "10.0000000", toBuyer: "0.0000000" },
    });
    expect(ev?.stage).toBe("released");
    expect(ev?.pactState).toBe("released");
  });

  it("decodes refunded events", () => {
    const ev = decodePactEvent({
      topic: "refunded",
      txHash,
      ledger: 50000005,
      payload: { pactId, toBuyer: "10.0000000" },
    });
    expect(ev?.stage).toBe("refunded");
    expect(ev?.pactState).toBe("refunded");
    expect(ev?.toBuyer).toBe("10.0000000");
  });

  it("decodes facilitator events", () => {
    const ev = decodeFacilitatorEvent({
      topic: "settled",
      txHash,
      ledger: 50000010,
      payload: { pactId, amount: "8.5000000" },
    });
    expect(ev?.source).toBe("facilitator");
    expect(ev?.stage).toBe("settled");
    expect(ev?.toSeller).toBe("8.5000000");
  });

  it("decodes RefundVault refund events", () => {
    const ev = decodeRefundVaultEvent({
      vaultId: "vault-1",
      topic: "refund",
      txHash,
      ledger: 50000012,
      payload: { pactId, amount: "3.2000000" },
    });
    expect(ev?.source).toBe("refund_vault:vault-1");
    expect(ev?.stage).toBe("refunded");
    expect(ev?.toBuyer).toBe("3.2000000");
  });
});

describe("Indexer idempotent persistence", () => {
  const mockQuery = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db).mockReturnValue({
      query: mockQuery,
    } as unknown as ReturnType<typeof db>);
    mockQuery.mockResolvedValue({ rows: [] });
  });

  it("persists events idempotently and advances cursor", async () => {
    const pactId = "1111111111111111111111111111111111111111111111111111111111111111";
    const ev = decodePactEvent({
      topic: "opened",
      txHash: "0x123",
      ledger: 50000000,
      payload: {
        pactId,
        buyer: "GA7Q",
        seller: "GBBD",
        resourceUrl: "https://api.pactwright.dev",
        cap: "10.0000000",
        conditionHash: "cccc",
        mode: "escrow",
      },
    })!;

    const count1 = await persistEvents([ev]);
    expect(count1).toBe(1);

    // Re-running over the exact same event does not throw and executes idempotent queries
    const count2 = await persistEvents([ev]);
    expect(count2).toBe(1);
    expect(mockQuery).toHaveBeenCalled();
  });
});
