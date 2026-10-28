import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { txUrl, accountUrl, contractUrl, getNetwork } from "../../lib/explorer";

describe("explorer urls", () => {
  const originalEnv = process.env.NEXT_PUBLIC_STELLAR_NETWORK;

  afterEach(() => {
    process.env.NEXT_PUBLIC_STELLAR_NETWORK = originalEnv;
  });

  it("links testnet transactions to the testnet explorer", () => {
    expect(txUrl("testnet", "abc")).toBe("https://stellar.expert/explorer/testnet/tx/abc");
  });

  it("links pubnet transactions to the public explorer", () => {
    expect(txUrl("pubnet", "abc")).toBe("https://stellar.expert/explorer/public/tx/abc");
  });

  it("links accounts to testnet and public explorers", () => {
    expect(accountUrl("testnet", "GABC")).toBe("https://stellar.expert/explorer/testnet/account/GABC");
    expect(accountUrl("pubnet", "GABC")).toBe("https://stellar.expert/explorer/public/account/GABC");
  });

  it("links contracts to testnet and public explorers", () => {
    expect(contractUrl("testnet", "CXYZ")).toBe("https://stellar.expert/explorer/testnet/contract/CXYZ");
    expect(contractUrl("pubnet", "CXYZ")).toBe("https://stellar.expert/explorer/public/contract/CXYZ");
  });

  it("resolves default network from env or defaults to testnet", () => {
    delete process.env.NEXT_PUBLIC_STELLAR_NETWORK;
    expect(getNetwork()).toBe("testnet");

    process.env.NEXT_PUBLIC_STELLAR_NETWORK = "pubnet";
    expect(getNetwork()).toBe("pubnet");

    process.env.NEXT_PUBLIC_STELLAR_NETWORK = "public";
    expect(getNetwork()).toBe("pubnet");

    process.env.NEXT_PUBLIC_STELLAR_NETWORK = "testnet";
    expect(getNetwork()).toBe("testnet");
  });
});
