import { describe, expect, it } from "vitest";
import { describeEvent, formatUsdc, modeName, silenceName, stateStamp, stroopsToUsdc } from "../../lib/format";

describe("amounts", () => {
  it("trims stored 7-decimal amounts to readable USDC, keeping cents and real precision", () => {
    expect(formatUsdc("1.0000000")).toBe("1.00");
    expect(formatUsdc("0.7500000")).toBe("0.75");
    expect(formatUsdc("0.1234567")).toBe("0.1234567");
    expect(formatUsdc("12")).toBe("12.00");
    expect(formatUsdc(null)).toBe("0.00");
  });

  it("converts on-chain stroops", () => {
    expect(stroopsToUsdc("10000000")).toBe("1.00");
    expect(stroopsToUsdc(7_500_000)).toBe("0.75");
    expect(stroopsToUsdc("0")).toBe("0.00");
    expect(stroopsToUsdc("not a number")).toBeNull();
    expect(stroopsToUsdc(undefined)).toBeNull();
  });
});

describe("states", () => {
  it("stamps money that moved as agreed in teal and money that came back in red", () => {
    expect(stateStamp("settled")).toEqual({ word: "Settled", ink: "teal" });
    expect(stateStamp("refunded")).toEqual({ word: "Refunded", ink: "red" });
    expect(stateStamp("denied").ink).toBe("red");
    expect(stateStamp("funded")).toEqual({ word: "In escrow", ink: "indigo" });
  });

  it("names modes and silence policies in plain words", () => {
    expect(modeName("escrow")).toBe("Escrow");
    expect(modeName("exact-refund")).toBe("Exact refund");
    expect(silenceName("refund")).toBe("Refund the buyer");
    expect(silenceName(null)).toBe("Not set");
  });
});

describe("timeline events", () => {
  // Event data as the indexer stores it (from a testnet pact).
  it("describes an opened pact with its cap and verdict deadline", () => {
    const e = describeEvent({ stage: "opened", data: { cap: "10000000", verdict_deadline: 5454646 } });
    expect(e).toEqual({ title: "Opened", detail: "1.00 USDC locked in escrow. Verdict due by ledger 5454646.", ink: "indigo" });
  });

  it("reads verdict 1 as allow and 2 as deny", () => {
    expect(describeEvent({ stage: "verdict", data: { verdict: 1, amount: "7500000" } })).toMatchObject({
      title: "Allowed",
      detail: "The verifier approved the delivery: 0.75 USDC owed to the seller.",
    });
    expect(describeEvent({ stage: "verdict", data: { verdict: 2, amount: "0" } })).toMatchObject({ title: "Denied", ink: "red" });
  });

  it("describes a settlement split", () => {
    expect(describeEvent({ stage: "settled", data: { to_seller: "7500000", to_buyer: "2500000" } }).detail).toBe(
      "0.75 USDC to the seller, 0.25 USDC back to the buyer.",
    );
  });
});
