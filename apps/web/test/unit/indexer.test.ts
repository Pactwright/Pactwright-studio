import { describe, expect, it } from "vitest";
import { decodePactEvent, decodeRefundVaultEvent } from "../../lib/indexer/sources";
import { stroopsToDecimal } from "../../lib/indexer";
import type { RawEvent } from "../../lib/chain";

// Shapes as `scValToNative` returns them for real testnet events (docs/EVENTS.md in
// Pactwright-contracts; Accensa RefundVault v0.2.0 `refund_event`).
const pactId = Buffer.from("3bff7dfd2a2019a5bc35d23c27335f81e8ed756dcc093ed1fb587abd73c9f276", "hex");
const raw = (topics: unknown[], value: unknown, contractId = "CPACT"): RawEvent => ({
  contractId,
  ledger: 5447617,
  txHash: "afd91ed1c548ff87a54965d252be1c580c0151977842aa061044deba1c4e7753",
  id: "1",
  topics,
  value,
});

describe("pact event decoding", () => {
  it("decodes opened", () => {
    const ev = decodePactEvent(
      raw(["pact", "opened"], {
        pact_id: pactId,
        buyer: "GAEOWB5ALLANW7LW6H56XNRJJJMJ43NSXQE4QWHP2IL6LNMUBK6Z5CZM",
        seller: "GCH4CVKGM2ZDPL66AVHIZ4YJS56A7OI6RFM72H336SUEERYCWHOGPQLE",
        cap: 10_000_000n,
        condition_hash: Buffer.alloc(32, 0xc7),
        metered: false,
        silence: 1,
        verdict_deadline: 5447737,
        settle_deadline: 5448336,
      }),
    );
    expect(ev).toMatchObject({
      stage: "opened",
      pactId: pactId.toString("hex"),
      cap: "10000000",
      silence: "refund",
      verdictDeadline: 5447737,
      mode: "escrow",
    });
    expect(ev?.data.cap).toBe("10000000");
  });

  it("decodes verdict, settled, meter_closed and released", () => {
    const verdict = decodePactEvent(raw(["pact", "verdict"], { pact_id: pactId, verdict: 1, amount: 7_500_000n, envelope_hash: Buffer.alloc(32, 1) }));
    expect(verdict).toMatchObject({ stage: "verdict", verdict: "ALLOW", amount: "7500000", pactState: "allowed" });
    expect(decodePactEvent(raw(["pact", "verdict"], { pact_id: pactId, verdict: 2, amount: 0n, envelope_hash: Buffer.alloc(32, 2) }))?.pactState).toBe("denied");

    expect(decodePactEvent(raw(["pact", "settled"], { pact_id: pactId, to_seller: 7_500_000n, to_buyer: 2_500_000n }))).toMatchObject({
      stage: "settled",
      toSeller: "7500000",
      toBuyer: "2500000",
    });
    expect(decodePactEvent(raw(["pact", "meter_closed"], { pact_id: pactId, units: 500, to_seller: 500_000n, to_buyer: 9_500_000n }))?.stage).toBe("meter_closed");
    expect(decodePactEvent(raw(["pact", "released"], { pact_id: pactId, reason: 2, to_buyer: 10_000_000n }))).toMatchObject({
      stage: "released",
      toSeller: "0",
      toBuyer: "10000000",
    });
  });

  it("ignores other contracts' topics and unknown events", () => {
    expect(decodePactEvent(raw(["transfer", "x"], {}))).toBeNull();
    expect(decodePactEvent(raw(["pact", "verifier_set"], { key: Buffer.alloc(32) }))).toBeNull();
  });
});

describe("RefundVault event decoding", () => {
  it("decodes refund_event with payment_ref = pact_id", () => {
    const ev = decodeRefundVaultEvent(
      raw(["refund_event", pactId], { amount: 10_000_000n, ledger: 5447614, recipient: "GAEOWB5ALLANW7LW6H56XNRJJJMJ43NSXQE4QWHP2IL6LNMUBK6Z5CZM" }, "CVAULT"),
    );
    expect(ev).toMatchObject({ stage: "refunded", pactId: pactId.toString("hex"), toBuyer: "10000000", source: "refund_vault:CVAULT" });
  });

  it("ignores deposits", () => {
    expect(decodeRefundVaultEvent(raw(["deposit_event", "GABC"], { amount: 1n }, "CVAULT"))).toBeNull();
  });
});

describe("stroopsToDecimal", () => {
  it("converts exactly", () => {
    expect(stroopsToDecimal("7500000")).toBe("0.7500000");
    expect(stroopsToDecimal(10_000_000n)).toBe("1.0000000");
    expect(stroopsToDecimal("0")).toBe("0.0000000");
  });
});
