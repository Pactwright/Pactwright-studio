/**
 * Offline Merkle certificate verification and receipt leaf computation. ROADMAP S-07.
 * Implements sorted-pair SHA-256 verification matching Accensa ReceiptAnchor (FR-R3).
 */
import { createHash } from "node:crypto";
import type { Transition } from "@/lib/types";

/**
 * Computes SHA-256 digest of input.
 */
export function sha256(data: Buffer | Uint8Array | string): Buffer {
  return createHash("sha256").update(data).digest();
}

/**
 * Computes terminal receipt leaf hash.
 * Leaf = sha256("pactwright-receipt-v1:" || pact_id || transition || to_seller || to_buyer || envelope_hash || ledger)
 */
export function computeReceiptLeaf(params: {
  pactId: string;
  transition: Transition;
  toSeller: string;
  toBuyer: string;
  envelopeHash?: string;
  ledger: number;
}): string {
  const code = { paid: 1, settled: 2, released: 3, refunded: 4 }[params.transition] ?? 1;
  const parts = [
    "pactwright-receipt-v1",
    params.pactId.trim().toLowerCase(),
    String(code),
    params.toSeller.trim(),
    params.toBuyer.trim(),
    (params.envelopeHash?.trim().toLowerCase() || "0000000000000000000000000000000000000000000000000000000000000000"),
    String(params.ledger),
  ];
  return createHash("sha256").update(parts.join(":")).digest("hex");
}

/**
 * Verifies that a leaf belongs to a Merkle root using sorted-pair SHA-256.
 * All hashes must be 64-character lowercase hexadecimal strings (32 bytes).
 *
 * @param leafHex 32-byte leaf digest in hex
 * @param proof Array of 32-byte sibling digests in hex
 * @param rootHex 32-byte expected Merkle root in hex
 * @returns true if computed root matches rootHex, false otherwise
 */
export function verifyReceipt(leafHex: string, proof: string[], rootHex: string): boolean {
  if (!leafHex || !rootHex || !Array.isArray(proof)) {
    return false;
  }

  const cleanLeaf = leafHex.trim().toLowerCase();
  const cleanRoot = rootHex.trim().toLowerCase();

  if (!/^[0-9a-f]{64}$/.test(cleanLeaf) || !/^[0-9a-f]{64}$/.test(cleanRoot)) {
    return false;
  }

  try {
    let current = Buffer.from(cleanLeaf, "hex");
    const expectedRoot = Buffer.from(cleanRoot, "hex");

    for (const siblingHex of proof) {
      const cleanSibling = siblingHex.trim().toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(cleanSibling)) {
        return false;
      }

      const sibling = Buffer.from(cleanSibling, "hex");

      // Sorted-pair SHA-256: smaller byte sequence comes first
      const combined = Buffer.compare(current, sibling) <= 0
        ? Buffer.concat([current, sibling])
        : Buffer.concat([sibling, current]);

      current = createHash("sha256").update(combined).digest();
    }

    return current.equals(expectedRoot);
  } catch {
    return false;
  }
}
