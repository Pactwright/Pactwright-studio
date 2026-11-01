import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the data layer and next/navigation so the page can run outside Next.
vi.mock("@/lib/pacts", () => ({
  getPactById: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

import { getPactById } from "@/lib/pacts";
import { notFound } from "next/navigation";
import PactPage from "@/app/pact/[id]/page";

const pactRow = {
  pact_id: "abc",
  state: "funded",
  mode: "escrow",
  cap: "10.5",
  to_seller: "0",
  to_buyer: "0",
  buyer: "GBUYER",
  seller: "GSELLER",
  silence: "refund",
  resource_url: null,
};

describe("Pact page (ROADMAP S-06)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the pact when the query returns it", async () => {
    vi.mocked(getPactById).mockResolvedValue({ pact: pactRow as never, events: [] });

    const html = JSON.stringify(await PactPage({ params: Promise.resolve({ id: "abc" }) }));

    expect(html).toContain("abc");
    expect(notFound).not.toHaveBeenCalled();
  });

  it("calls notFound() when the pact is genuinely absent", async () => {
    vi.mocked(getPactById).mockResolvedValue(null);

    await expect(PactPage({ params: Promise.resolve({ id: "missing" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("lets a database failure throw instead of rendering the not-found view", async () => {
    vi.mocked(getPactById).mockRejectedValue(new Error("connection refused"));

    await expect(PactPage({ params: Promise.resolve({ id: "abc" }) })).rejects.toThrow("connection refused");
    expect(notFound).not.toHaveBeenCalled();
  });
});
