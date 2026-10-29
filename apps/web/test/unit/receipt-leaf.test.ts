import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { computeReceiptLeaf } from "../../lib/verify";
import type { Transition } from "../../lib/types";

// Copied from Pactwright-contracts/test-vectors (the source of truth, ADR-015).
const vectors = JSON.parse(readFileSync(join(__dirname, "../fixtures/receipt_leaf.json"), "utf8")) as {
  cases: Array<{
    name: string;
    input: { pact_id: string; transition: number; to_seller: string; to_buyer: string; envelope_hash: string | null; ledger: number };
    output: string;
  }>;
};
const TRANSITIONS: Transition[] = ["paid", "settled", "released", "refunded"];

describe("computeReceiptLeaf matches the contract's test vectors", () => {
  for (const c of vectors.cases) {
    it(c.name, () => {
      expect(
        computeReceiptLeaf({
          pactId: c.input.pact_id,
          transition: TRANSITIONS[c.input.transition - 1]!,
          toSeller: c.input.to_seller,
          toBuyer: c.input.to_buyer,
          envelopeHash: c.input.envelope_hash,
          ledger: c.input.ledger,
        }),
      ).toBe(c.output);
    });
  }
});
