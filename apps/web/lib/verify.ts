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

const RECEIPT_DOMAIN = Buffer.from("pactwright-receipt-v1", "utf8");
const TRANSITION_CODE: Record<Transition, number> = { paid: 1, settled: 2, released: 3, refunded: 4 };

/** Big-endian two's-complement i128, as the contract encodes it. */
function i128be(value: bigint): Buffer {
  const out = Buffer.alloc(16);
  out.writeBigInt64BE(value >> 64n, 0);
  out.writeBigUInt64BE(value & 0xffffffffffffffffn, 8);
  return out;
}

/**
 * Terminal receipt leaf, byte for byte as `hashing::receipt_leaf` in the pact contract
 * (pinned by Pactwright-contracts/test-vectors/receipt_leaf.json):
 *
 * sha256("pactwright-receipt-v1" ‖ pact_id ‖ transition_u32 ‖ to_seller_i128 ‖ to_buyer_i128 ‖
 *        (envelope_hash or 32 zero bytes) ‖ ledger_u32), integers big-endian, amounts in stroops.
 */
export function computeReceiptLeaf(params: {
  pactId: string;
  transition: Transition;
  /** Stroops. */
  toSeller: bigint | string;
  /** Stroops. */
  toBuyer: bigint | string;
  envelopeHash?: string | null;
  ledger: number;
}): string {
  const pactId = Buffer.from(params.pactId.trim().toLowerCase(), "hex");
  if (pactId.length !== 32) throw new Error("pactId must be 32 bytes of hex");
  const envelope = params.envelopeHash ? Buffer.from(params.envelopeHash.trim().toLowerCase(), "hex") : Buffer.alloc(32);
  if (envelope.length !== 32) throw new Error("envelopeHash must be 32 bytes of hex");
  const transition = Buffer.alloc(4);
  transition.writeUInt32BE(TRANSITION_CODE[params.transition], 0);
  const ledger = Buffer.alloc(4);
  ledger.writeUInt32BE(params.ledger, 0);
  return createHash("sha256")
    .update(
      Buffer.concat([
        RECEIPT_DOMAIN,
        pactId,
        transition,
        i128be(BigInt(params.toSeller)),
        i128be(BigInt(params.toBuyer)),
        envelope,
        ledger,
      ]),
    )
    .digest("hex");
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
