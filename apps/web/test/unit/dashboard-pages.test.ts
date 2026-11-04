import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the data layers so the pages can run outside Next (ROADMAP P7-10, P7-11).
vi.mock("@/lib/merchant", () => ({
  getMerchantDashboardData: vi.fn(),
}));

vi.mock("@/lib/principal", () => ({
  getPrincipalDashboardData: vi.fn(),
}));

import { getMerchantDashboardData } from "@/lib/merchant";
import { getPrincipalDashboardData } from "@/lib/principal";
import MerchantDashboardPage from "@/app/(merchant)/merchant/page";
import PrincipalViewPage from "@/app/(principal)/principal/page";

const EMPTY_SELLERS = "No sellers are registered yet";

describe("Merchant dashboard page (ROADMAP P7-10)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the empty state only when the query returns null", async () => {
    vi.mocked(getMerchantDashboardData).mockResolvedValue(null);

    const html = JSON.stringify(await MerchantDashboardPage({ searchParams: Promise.resolve({}) }));

    expect(html).toContain(EMPTY_SELLERS);
  });

  it("lets a database failure throw instead of rendering the empty state", async () => {
    vi.mocked(getMerchantDashboardData).mockRejectedValue(new Error("connection refused"));

    await expect(MerchantDashboardPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("connection refused");
  });
});

describe("Principal view page (ROADMAP P7-11)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the empty state only when the query returns null", async () => {
    vi.mocked(getPrincipalDashboardData).mockResolvedValue(null);

    const html = JSON.stringify(await PrincipalViewPage({ searchParams: Promise.resolve({}) }));

    expect(html).toContain("No principals are registered yet");
  });

  it("lets a database failure throw instead of rendering the empty state", async () => {
    vi.mocked(getPrincipalDashboardData).mockRejectedValue(new Error("connection refused"));

    await expect(PrincipalViewPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("connection refused");
  });
});
