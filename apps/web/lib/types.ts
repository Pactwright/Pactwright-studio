/**
 * Row types for migrations/001_core.sql. Amounts are decimal strings (numeric(30,7)).
 * Keep in sync with @pactwright/core schemas.ts and the SQL.
 */
export type Mode = "exact-refund" | "escrow";
export type PactState = "funded" | "paid" | "allowed" | "denied" | "settled" | "released" | "refunded";
export type Transition = "paid" | "settled" | "released" | "refunded";
export type Stage = "opened" | "paid" | "verdict" | "settled" | "meter_closed" | "released" | "refunded";

export interface PactRow {
  pact_id: string;
  mode: Mode;
  buyer: string;
  seller: string;
  resource_url: string;
  cap: string;
  condition_hash: string;
  condition: Record<string, unknown>;
  metered: boolean;
  silence: "refund" | "pay" | null;
  state: PactState;
  verdict_deadline: number | null;
  settle_deadline: number | null;
  to_seller: string;
  to_buyer: string;
  created_at: Date;
  updated_at: Date;
}

export interface PactEventRow {
  id: number;
  pact_id: string;
  stage: Stage;
  tx_hash: string | null;
  ledger: number | null;
  data: Record<string, unknown>;
}

export interface VerdictRow {
  envelope_hash: string;
  pact_id: string;
  milestone: string;
  verdict: "ALLOW" | "DENY";
  amount: string | null;
  envelope: Record<string, unknown>;
  attested: boolean;
  created_at: Date;
}

export interface ReceiptBatchRow {
  batch_id: number;
  root: string;
  leaf_count: number;
  /** Null only for a batch recovered from the chain after a crash. */
  anchor_tx: string | null;
  anchored_at: Date;
  anchored_ledger: number | null;
}

export interface ReceiptRow {
  leaf: string;
  pact_id: string;
  transition: Transition;
  batch_id: number | null;
  proof: string[] | null;
}

export interface SyncStateRow {
  source: string;
  cursor_ledger: number;
}
