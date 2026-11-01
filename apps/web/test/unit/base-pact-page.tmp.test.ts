import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/pacts", () => ({
  getPactById: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

import { getPactById } from "@/lib/pacts";
import PactPage from "@/app/pact/[id]/base-page.tmp";

describe("base pact page", () => {
  it("lets a database failure throw instead of rendering the not-found view", async () => {
    vi.mocked(getPactById).mockRejectedValue(new Error("connection refused"));

    await expect(PactPage({ params: Promise.resolve({ id: "abc" }) })).rejects.toThrow("connection refused");
  });
});
