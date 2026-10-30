/**
 * Display formatting for Studio pages: amounts, states and timeline events in plain words.
 * Pure functions, so pages and tests share one wording.
 */
import type { Mode, PactEventRow, PactState } from "@/lib/types";

/** Same conversion as the indexer's, without importing the indexer (and its chain client). */
function stroopsToDecimal(v: bigint): string {
  const abs = v < 0n ? -v : v;
  return `${v < 0n ? "-" : ""}${abs / 10_000_000n}.${(abs % 10_000_000n).toString().padStart(7, "0")}`;
}

/** "1.0000000" → "1.00", "0.7500000" → "0.75", "0.1234567" stays exact. */
export function formatUsdc(decimal: string | null | undefined): string {
  if (decimal == null || decimal === "") return "0.00";
  const [whole, frac = ""] = decimal.split(".");
  const trimmed = frac.replace(/0+$/, "").padEnd(2, "0");
  return `${whole}.${trimmed}`;
}

export function stroopsToUsdc(stroops: unknown): string | null {
  if (typeof stroops !== "string" && typeof stroops !== "number" && typeof stroops !== "bigint") return null;
  try {
    return formatUsdc(stroopsToDecimal(BigInt(stroops)));
  } catch {
    return null;
  }
}

export type Ink = "teal" | "red" | "indigo";

/** The word stamped on a pact, and the ink it is stamped in. */
export function stateStamp(state: PactState): { word: string; ink: Ink } {
  switch (state) {
    case "funded":
      return { word: "In escrow", ink: "indigo" };
    case "paid":
      return { word: "Paid", ink: "teal" };
    case "allowed":
      return { word: "Allowed", ink: "teal" };
    case "settled":
      return { word: "Settled", ink: "teal" };
    case "released":
      return { word: "Released", ink: "teal" };
    case "denied":
      return { word: "Denied", ink: "red" };
    case "refunded":
      return { word: "Refunded", ink: "red" };
  }
}

export function modeName(mode: Mode | string): string {
  if (mode === "escrow") return "Escrow";
  if (mode === "exact-refund") return "Exact refund";
  return mode;
}

export function silenceName(silence: string | null): string {
  if (silence === "refund") return "Refund the buyer";
  if (silence === "pay") return "Pay the seller";
  return "Not set";
}

/** A timeline event as a short sentence, from the indexed event data. */
export function describeEvent(event: Pick<PactEventRow, "stage" | "data">): { title: string; detail: string; ink: Ink } {
  const d = event.data ?? {};
  switch (event.stage) {
    case "opened": {
      const cap = stroopsToUsdc(d.cap);
      const due = typeof d.verdict_deadline === "number" ? ` Verdict due by ledger ${d.verdict_deadline}.` : "";
      return { title: "Opened", detail: `${cap ?? "The cap"} USDC locked in escrow.${due}`, ink: "indigo" };
    }
    case "verdict": {
      const allowed = Number(d.verdict) === 1;
      const amount = stroopsToUsdc(d.amount);
      return allowed
        ? { title: "Allowed", detail: `The verifier approved the delivery: ${amount ?? "an amount"} USDC owed to the seller.`, ink: "teal" }
        : { title: "Denied", detail: "The verifier rejected the delivery. Nothing is owed to the seller.", ink: "red" };
    }
    case "settled": {
      const seller = stroopsToUsdc(d.to_seller) ?? "0.00";
      const buyer = stroopsToUsdc(d.to_buyer) ?? "0.00";
      return { title: "Settled", detail: `${seller} USDC to the seller, ${buyer} USDC back to the buyer.`, ink: "teal" };
    }
    case "paid":
      return { title: "Paid", detail: "The buyer paid the seller directly.", ink: "teal" };
    case "released":
      return { title: "Released", detail: "The escrow was released.", ink: "teal" };
    case "refunded":
      return { title: "Refunded", detail: "The money went back to the buyer.", ink: "red" };
    case "meter_closed":
      return { title: "Meter closed", detail: "Metered usage was closed.", ink: "indigo" };
  }
}
