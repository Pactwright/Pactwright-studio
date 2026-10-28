/**
 * Event sources and decoders for Pactwright, Facilitator and RefundVault. ROADMAP S-02.
 */
import type { Stage, Mode, PactState } from "@/lib/types";

export interface DecodedEvent {
  source: string;
  pactId: string;
  stage: Stage;
  txHash: string;
  ledger: number;
  data: Record<string, unknown>;
  // Pact state mutation:
  pactState?: PactState;
  mode?: Mode;
  buyer?: string;
  seller?: string;
  resourceUrl?: string;
  cap?: string;
  conditionHash?: string;
  condition?: Record<string, unknown>;
  metered?: boolean;
  silence?: "refund" | "pay" | null;
  verdictDeadline?: number | null;
  settleDeadline?: number | null;
  toSeller?: string;
  toBuyer?: string;
  envelopeHash?: string;
}

/**
 * Decodes raw pact contract events.
 */
export function decodePactEvent(raw: {
  topic: string;
  txHash: string;
  ledger: number;
  payload: Record<string, unknown>;
}): DecodedEvent | null {
  const { topic, txHash, ledger, payload } = raw;
  const pactId = String(payload.pactId ?? payload.pact_id ?? "");

  if (!pactId) return null;

  switch (topic) {
    case "opened":
    case "pact_opened":
      return {
        source: "pact",
        pactId,
        stage: "opened",
        txHash,
        ledger,
        pactState: "funded",
        mode: (payload.mode as Mode) ?? "escrow",
        buyer: String(payload.buyer ?? ""),
        seller: String(payload.seller ?? ""),
        resourceUrl: String(payload.resourceUrl ?? payload.resource_url ?? ""),
        cap: String(payload.cap ?? "0"),
        conditionHash: String(payload.conditionHash ?? payload.condition_hash ?? ""),
        condition: (payload.condition as Record<string, unknown>) ?? {},
        metered: Boolean(payload.metered),
        silence: (payload.silence as "refund" | "pay") ?? null,
        verdictDeadline: payload.verdictDeadline != null ? Number(payload.verdictDeadline) : null,
        settleDeadline: payload.settleDeadline != null ? Number(payload.settleDeadline) : null,
        toSeller: "0",
        toBuyer: "0",
        data: payload,
      };

    case "paid":
    case "pact_paid":
      return {
        source: "pact",
        pactId,
        stage: "paid",
        txHash,
        ledger,
        pactState: "paid",
        toSeller: String(payload.toSeller ?? payload.to_seller ?? payload.amount ?? "0"),
        toBuyer: String(payload.toBuyer ?? payload.to_buyer ?? "0"),
        data: payload,
      };

    case "verdict":
    case "verdict_submitted":
      return {
        source: "pact",
        pactId,
        stage: "verdict",
        txHash,
        ledger,
        pactState: String(payload.verdict).toUpperCase() === "ALLOW" ? "allowed" : "denied",
        envelopeHash: String(payload.envelopeHash ?? payload.envelope_hash ?? ""),
        data: payload,
      };

    case "settled":
    case "pact_settled":
      return {
        source: "pact",
        pactId,
        stage: "settled",
        txHash,
        ledger,
        pactState: "settled",
        toSeller: String(payload.toSeller ?? payload.to_seller ?? "0"),
        toBuyer: String(payload.toBuyer ?? payload.to_buyer ?? "0"),
        data: payload,
      };

    case "meter_closed":
      return {
        source: "pact",
        pactId,
        stage: "meter_closed",
        txHash,
        ledger,
        data: payload,
      };

    case "released":
    case "pact_released":
      return {
        source: "pact",
        pactId,
        stage: "released",
        txHash,
        ledger,
        pactState: "released",
        toSeller: String(payload.toSeller ?? payload.to_seller ?? "0"),
        toBuyer: String(payload.toBuyer ?? payload.to_buyer ?? "0"),
        data: payload,
      };

    case "refunded":
    case "pact_refunded":
      return {
        source: "pact",
        pactId,
        stage: "refunded",
        txHash,
        ledger,
        pactState: "refunded",
        toSeller: "0",
        toBuyer: String(payload.toBuyer ?? payload.to_buyer ?? payload.amount ?? "0"),
        data: payload,
      };

    default:
      return null;
  }
}

/**
 * Decodes facilitator settlement events.
 */
export function decodeFacilitatorEvent(raw: {
  topic: string;
  txHash: string;
  ledger: number;
  payload: Record<string, unknown>;
}): DecodedEvent | null {
  const { topic, txHash, ledger, payload } = raw;
  const pactId = String(payload.pactId ?? payload.pact_id ?? "");
  if (!pactId) return null;

  if (topic === "settle" || topic === "settled" || topic === "facilitator_settled") {
    return {
      source: "facilitator",
      pactId,
      stage: "settled",
      txHash,
      ledger,
      pactState: "settled",
      toSeller: String(payload.amount ?? payload.toSeller ?? payload.to_seller ?? "0"),
      toBuyer: "0",
      data: payload,
    };
  }

  return null;
}

/**
 * Decodes RefundVault refund events.
 */
export function decodeRefundVaultEvent(raw: {
  vaultId: string;
  topic: string;
  txHash: string;
  ledger: number;
  payload: Record<string, unknown>;
}): DecodedEvent | null {
  const { vaultId, topic, txHash, ledger, payload } = raw;
  const pactId = String(payload.pactId ?? payload.pact_id ?? "");
  if (!pactId) return null;

  if (topic === "refund" || topic === "refunded") {
    return {
      source: `refund_vault:${vaultId}`,
      pactId,
      stage: "refunded",
      txHash,
      ledger,
      pactState: "refunded",
      toSeller: "0",
      toBuyer: String(payload.amount ?? payload.toBuyer ?? payload.to_buyer ?? "0"),
      data: payload,
    };
  }

  return null;
}

/**
 * Fetches events from configured RPC or mock source for the given ledger range.
 */
export async function fetchEvents(
  _source: string,
  _fromLedger: number,
  _toLedger?: number
): Promise<DecodedEvent[]> {
  // Production connects to Soroban RPC getEvents; stub returns empty array unless events injected
  return [];
}
