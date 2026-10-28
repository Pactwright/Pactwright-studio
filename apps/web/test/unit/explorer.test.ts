import { describe, expect, it } from "vitest";
import { txUrl } from "../../lib/explorer";

describe("txUrl", () => {
  it("links testnet transactions to the testnet explorer", () => {
    expect(txUrl("testnet", "abc")).toBe("https://stellar.expert/explorer/testnet/tx/abc");
  });

  it("links pubnet transactions to the public explorer", () => {
    expect(txUrl("pubnet", "abc")).toBe("https://stellar.expert/explorer/public/tx/abc");
  });
});
