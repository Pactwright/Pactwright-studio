/**
 * Decoders for the events Studio indexes, as the contracts emit them. ROADMAP S-02.
 *
 * - `pact` contract: topics `("pact", <name>)`, data a map (Pactwright-contracts docs/EVENTS.md).
 * - Accensa RefundVault v0.2.0: topics `("refund_event", payment_ref)`, data
 *   `{ amount, ledger, recipient }`. Pactwright uses `payment_ref = pact_id`.
 *
 * Amounts stay in stroops (decimal strings of integers) until they are written to the database.
 */
import { chainConfig, contractEvents, type ChainConfig, type RawEvent } from "@/lib/chain";
import type { Mode, PactState, Stage } from "@/lib/types";

export interface DecodedEvent {
  source: string;
  pactId: string;
  stage: Stage;
  txHash: string;
  ledger: number;
  data: Record<string, unknown>;
  pactState?: PactState;
  mode?: Mode;
  buyer?: string;
  seller?: string;
  /** Stroops. */
  cap?: string;
  conditionHash?: string;
  metered?: boolean;
  silence?: "refund" | "pay" | null;
  verdictDeadline?: number | null;
  settleDeadline?: number | null;
  verdict?: "ALLOW" | "DENY";
  /** Stroops. */
  amount?: string;
  /** Stroops. */
  toSeller?: string;
  /** Stroops. */
  toBuyer?: string;
  envelopeHash?: string;
}

const hex = (v: unknown): string => Buffer.from(v as Uint8Array).toString("hex");
const int = (v: unknown): string => BigInt(v as bigint | number | string).toString();

/** JSON-safe copy of an event's data for `pact_events.data`. */
function jsonData(value: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries((value ?? {}) as Record<string, unknown>)) {
    out[k] = v instanceof Uint8Array ? hex(v) : typeof v === "bigint" ? v.toString() : v;
  }
  return out;
}

export function decodePactEvent(raw: RawEvent): DecodedEvent | null {
  const [namespace, name] = raw.topics;
  if (namespace !== "pact" || typeof name !== "string") return null;
  const d = (raw.value ?? {}) as Record<string, unknown>;
  if (!(d.pact_id instanceof Uint8Array)) return null;
  const base = { source: "pact", pactId: hex(d.pact_id), txHash: raw.txHash, ledger: raw.ledger, data: jsonData(d) };

  switch (name) {
    case "opened":
      return {
        ...base,
        stage: "opened",
        pactState: "funded",
        mode: "escrow",
        buyer: String(d.buyer),
        seller: String(d.seller),
        cap: int(d.cap),
        conditionHash: hex(d.condition_hash),
        metered: Boolean(d.metered),
        silence: Number(d.silence) === 2 ? "pay" : "refund",
        verdictDeadline: Number(d.verdict_deadline),
        settleDeadline: Number(d.settle_deadline),
      };
    case "verdict": {
      const verdict = Number(d.verdict) === 1 ? "ALLOW" : "DENY";
      return {
        ...base,
        stage: "verdict",
        pactState: verdict === "ALLOW" ? "allowed" : "denied",
        verdict,
        amount: int(d.amount),
        envelopeHash: hex(d.envelope_hash),
      };
    }
    case "settled":
      return { ...base, stage: "settled", pactState: "settled", toSeller: int(d.to_seller), toBuyer: int(d.to_buyer) };
    case "meter_closed":
      return { ...base, stage: "meter_closed", pactState: "settled", toSeller: int(d.to_seller), toBuyer: int(d.to_buyer) };
    case "released":
      return { ...base, stage: "released", pactState: "released", toSeller: "0", toBuyer: int(d.to_buyer) };
    default:
      return null;
  }
}

export function decodeRefundVaultEvent(raw: RawEvent): DecodedEvent | null {
  const [name, paymentRef] = raw.topics;
  if (name !== "refund_event" || !(paymentRef instanceof Uint8Array) || paymentRef.length !== 32) return null;
  const d = (raw.value ?? {}) as Record<string, unknown>;
  return {
    source: `refund_vault:${raw.contractId}`,
    pactId: hex(paymentRef),
    stage: "refunded",
    txHash: raw.txHash,
    ledger: raw.ledger,
    pactState: "refunded",
    toSeller: "0",
    toBuyer: int(d.amount),
    data: { ...jsonData(d), vault: raw.contractId },
  };
}

/** The sources to index: the pact contract and every configured RefundVault. */
export function sources(config: ChainConfig = chainConfig()): Array<{ name: string; contractId: string }> {
  return [
    { name: "pact", contractId: config.pactContractId },
    ...config.refundVaultIds.map((id) => ({ name: `refund_vault:${id}`, contractId: id })),
  ];
}

/** Reads one source from `fromLedger` to the RPC's latest ledger and decodes its events. */
export async function fetchEvents(
  source: { name: string; contractId: string },
  fromLedger: number,
  config: ChainConfig = chainConfig(),
): Promise<{ events: DecodedEvent[]; latestLedger: number; oldestLedger: number; throughLedger: number }> {
  const page = await contractEvents(config, source.contractId, fromLedger);
  const decode = source.name === "pact" ? decodePactEvent : decodeRefundVaultEvent;
  const events = page.events.map(decode).filter((e): e is DecodedEvent => e !== null);
  return { events, latestLedger: page.latestLedger, oldestLedger: page.oldestLedger, throughLedger: page.throughLedger };
}
