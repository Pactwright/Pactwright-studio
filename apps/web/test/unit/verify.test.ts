import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { verifyReceipt } from "../../lib/verify";

function sortedPairHash(a: string, b: string): string {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  const combined = Buffer.compare(bufA, bufB) <= 0
    ? Buffer.concat([bufA, bufB])
    : Buffer.concat([bufB, bufA]);
  return createHash("sha256").update(combined).digest("hex");
}

describe("verifyReceipt (sorted-pair SHA-256 Merkle proof)", () => {
  const leaf1 = "1111111111111111111111111111111111111111111111111111111111111111";
  const leaf2 = "2222222222222222222222222222222222222222222222222222222222222222";
  const leaf3 = "3333333333333333333333333333333333333333333333333333333333333333";
  const leaf4 = "4444444444444444444444444444444444444444444444444444444444444444";

  // Level 1: pair(1,2) and pair(3,4)
  const node12 = sortedPairHash(leaf1, leaf2);
  const node34 = sortedPairHash(leaf3, leaf4);

  // Root: pair(node12, node34)
  const root = sortedPairHash(node12, node34);

  it("verifies a valid multi-level Merkle proof", () => {
    // Proof for leaf1 is [leaf2, node34]
    const proof = [leaf2, node34];
    expect(verifyReceipt(leaf1, proof, root)).toBe(true);
  });

  it("verifies a valid proof for leaf3", () => {
    // Proof for leaf3 is [leaf4, node12]
    const proof = [leaf4, node12];
    expect(verifyReceipt(leaf3, proof, root)).toBe(true);
  });

  it("rejects when the leaf has been tampered with", () => {
    const tamperedLeaf = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
    const proof = [leaf2, node34];
    expect(verifyReceipt(tamperedLeaf, proof, root)).toBe(false);
  });

  it("rejects when a proof sibling has been tampered with", () => {
    const tamperedProof = [
      "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      node34,
    ];
    expect(verifyReceipt(leaf1, tamperedProof, root)).toBe(false);
  });

  it("rejects when the root is incorrect", () => {
    const fakeRoot = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
    const proof = [leaf2, node34];
    expect(verifyReceipt(leaf1, proof, fakeRoot)).toBe(false);
  });

  it("returns false on malformed hex strings", () => {
    expect(verifyReceipt("invalid-hex", [], root)).toBe(false);
    expect(verifyReceipt(leaf1, ["short"], root)).toBe(false);
    expect(verifyReceipt(leaf1, [], "not-a-root")).toBe(false);
  });
});
