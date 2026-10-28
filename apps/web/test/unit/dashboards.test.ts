import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the db module
vi.mock("@/lib/db", () => {
  return {
    db: vi.fn(),
  };
});

import { db } from "@/lib/db";
import { getMerchantDashboardData } from "../../lib/merchant";
import { getPrincipalDashboardData } from "../../lib/principal";

describe("Merchant Dashboard (ROADMAP P7-10)", () => {
  const mockQuery = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db).mockReturnValue({
      query: mockQuery,
    } as unknown as ReturnType<typeof db>);
  });

  it("calculates revenue, reliability rates, and route breakdown", async () => {
    const mockSeller = {
      address: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      name: "Pollar Weather API",
      delivery_key: "4444",
      refund_vault: null,
    };

    const mockRoutes = [
      {
        id: 1,
        seller: mockSeller.address,
        resource_url: "https://api.pactwright.dev/data/weather",
        mode: "escrow",
        price: "10.0000000",
        verify_min_amount: "5.0000000",
        silence: "refund",
        refund_window_ledgers: 100,
      },
    ];

    const mockPacts = [
      { pact_id: "p1", state: "settled", to_seller: "10.0000000", to_buyer: "0.0000000", cap: "10" },
      { pact_id: "p2", state: "paid", to_seller: "5.0000000", to_buyer: "0.0000000", cap: "5" },
      { pact_id: "p3", state: "refunded", to_seller: "0.0000000", to_buyer: "2.5000000", cap: "2.5" },
      { pact_id: "p4", state: "denied", to_seller: "0.0000000", to_buyer: "0.0000000", cap: "5" },
    ];

    mockQuery
      .mockResolvedValueOnce({ rows: [mockSeller] }) // sellers
      .mockResolvedValueOnce({ rows: mockRoutes }) // routes
      .mockResolvedValueOnce({ rows: mockPacts }); // pacts

    const data = await getMerchantDashboardData();
    expect(data).not.toBeNull();
    expect(data?.seller.name).toBe("Pollar Weather API");
    expect(data?.metrics.totalRevenue).toBe("15.0000000"); // 10 + 5
    expect(data?.metrics.totalPacts).toBe(4);
    expect(data?.metrics.settledPacts).toBe(2);
    expect(data?.metrics.refundedPacts).toBe(1);
    expect(data?.metrics.disputeCount).toBe(1);
    expect(data?.metrics.refundRate).toBe(25); // 1 / 4 = 25%
    expect(data?.metrics.disputeRate).toBe(25); // 1 / 4 = 25%
    expect(data?.routes).toHaveLength(1);
  });
});

describe("Principal View (ROADMAP P7-11)", () => {
  const mockQuery = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db).mockReturnValue({
      query: mockQuery,
    } as unknown as ReturnType<typeof db>);
  });

  it("calculates budget balances and lists open pacts", async () => {
    const principal = "GCPRINCIPAL0000000000000000000000000000000000000000";
    const mockAgents = [
      { address: "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVWGS", principal, label: "Bot 1" },
    ];

    const mockBudgets = [
      { id: 1, agent: mockAgents[0].address, amount: "100.0000000", asset: "USDC", status: "funded", gate: "manual", funding_tx: null },
      { id: 2, agent: mockAgents[0].address, amount: "50.0000000", asset: "USDC", status: "pending", gate: "manual", funding_tx: null },
    ];

    const mockLivePacts = [
      {
        pact_id: "2222222222222222222222222222222222222222222222222222222222222222",
        buyer: mockAgents[0].address,
        seller: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
        resource_url: "https://api.pactwright.dev/compute",
        cap: "5.0000000",
        state: "funded",
        mode: "exact-refund",
      },
    ];

    mockQuery
      .mockResolvedValueOnce({ rows: [{ principal }] }) // principals
      .mockResolvedValueOnce({ rows: mockAgents }) // agents
      .mockResolvedValueOnce({ rows: mockBudgets }) // budgets
      .mockResolvedValueOnce({ rows: mockLivePacts }); // live pacts

    const data = await getPrincipalDashboardData();
    expect(data).not.toBeNull();
    expect(data?.principal).toBe(principal);
    expect(data?.metrics.totalBudget).toBe("150.0000000");
    expect(data?.metrics.fundedBudget).toBe("100.0000000");
    expect(data?.metrics.activeAgentsCount).toBe(1);
    expect(data?.metrics.livePactsCount).toBe(1);
    expect(data?.livePacts[0].pact_id).toBe(mockLivePacts[0].pact_id);
  });
});
