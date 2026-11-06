"use client";

import { useState } from "react";
import type { PactState } from "@/lib/types";
import { StateBadge } from "./StateBadge";

type ScenarioKey = "full" | "partial" | "denied" | "timeout";

interface Scenario {
  title: string;
  badge: string;
  state: PactState;
  cap: string;
  verdict: string;
  action: string;
  seller: string;
  buyer: string;
  quote: string;
  hashMeta: string;
  txHash: string;
  payload: Record<string, unknown>;
}

const SAMPLE_PACT_ID = "9b1deb4d3b7d4b648ac4290d03ee69d3a7b57b98a3b5a772c1c3f2d24b7a42ec";

const SCENARIOS: Record<ScenarioKey, Scenario> = {
  full: {
    title: "Full Delivery (100%)",
    badge: "Settled",
    state: "settled",
    cap: "1.00 USDC",
    verdict: "ALLOW 1.00",
    action: "Full Seller Payout",
    seller: "1.00 USDC",
    buyer: "0.00 USDC",
    quote: "The hosted verifier validated translation quality: 4 of 4 pages approved. 1.00 USDC paid to seller.",
    hashMeta: "Stellar Ledger #5453762 · Settle Tx: 1f4ab38c…",
    txHash: "1f4ab38c92de004561fa2b1093412589e47209148d1029c9b139049021e84a29",
    payload: {
      pact_id: SAMPLE_PACT_ID,
      action: "settle",
      to_seller: "1.0000000",
      to_buyer: "0.0000000",
      resolution: "fulfilled",
      network: "stellar-soroban",
    },
  },
  partial: {
    title: "Partial (75% / 25%)",
    badge: "Settled",
    state: "settled",
    cap: "1.00 USDC",
    verdict: "ALLOW 0.75",
    action: "Split Payout",
    seller: "0.75 USDC",
    buyer: "0.25 USDC",
    quote: "Deliverable met 3 of 4 criteria. Verifier issued partial settlement: 0.75 USDC released to merchant, 0.25 USDC refunded to buyer.",
    hashMeta: "Stellar Ledger #5454120 · Split Tx: e71a09cd…",
    txHash: "e71a09cd559124ad910c29148560914850914bca8102948210948120491024bc",
    payload: {
      pact_id: SAMPLE_PACT_ID,
      action: "split_settle",
      to_seller: "0.7500000",
      to_buyer: "0.2500000",
      resolution: "partial_delivery",
      network: "stellar-soroban",
    },
  },
  denied: {
    title: "Hallucinated (Refund)",
    badge: "Refunded",
    state: "refunded",
    cap: "1.00 USDC",
    verdict: "DENIED (Hallucination)",
    action: "Full Buyer Refund",
    seller: "0.00 USDC",
    buyer: "1.00 USDC",
    quote: "Verifier detected fabricated citations and schema failure. Settlement denied: full 1.00 USDC refunded to buyer agent escrow.",
    hashMeta: "Stellar Ledger #5454890 · Refund Tx: 4a9bc012…",
    txHash: "4a9bc01289de41094810294bca9104820194812048910482019481204812049a",
    payload: {
      pact_id: SAMPLE_PACT_ID,
      action: "refund",
      to_seller: "0.0000000",
      to_buyer: "1.0000000",
      resolution: "schema_validation_failed",
      network: "stellar-soroban",
    },
  },
  timeout: {
    title: "Timeout (Silence)",
    badge: "Refunded",
    state: "refunded",
    cap: "1.00 USDC",
    verdict: "EXPIRED (No Delivery)",
    action: "Permissionless Clawback",
    seller: "0.00 USDC",
    buyer: "1.00 USDC",
    quote: "Merchant failed to deliver receipt within agreed timeout window (300 blocks). Escrow expired: buyer triggered emergency withdrawal.",
    hashMeta: "Stellar Ledger #5455340 · Timeout Tx: 8d20ef39…",
    txHash: "8d20ef3981024bc9102481029481204812048910248102481204918204918204",
    payload: {
      pact_id: SAMPLE_PACT_ID,
      action: "clawback",
      to_seller: "0.0000000",
      to_buyer: "1.0000000",
      resolution: "lock_window_expired",
      network: "stellar-soroban",
    },
  },
};

const SCENARIO_KEYS: ScenarioKey[] = ["full", "partial", "denied", "timeout"];

export function Simulator() {
  const [active, setActive] = useState<ScenarioKey>("full");
  const s = SCENARIOS[active];

  return (
    <div className="sim-stage" aria-label="Interactive Settlement Simulator">
      <div className="sim-tabs-bar" role="tablist" aria-label="Simulation Scenarios">
        {SCENARIO_KEYS.map((key) => {
          const item = SCENARIOS[key];
          const isSelected = active === key;
          return (
            <button
              key={key}
              type="button"
              className="sim-tab"
              role="tab"
              id={`tab-${key}`}
              aria-selected={isSelected}
              aria-controls={`panel-${key}`}
              onClick={() => setActive(key)}
            >
              {item.title}
            </button>
          );
        })}
      </div>

      <div
        className="sim-body"
        role="tabpanel"
        id={`panel-${active}`}
        aria-labelledby={`tab-${active}`}
      >
        <div className="sim-meta-header">
          <div className="sim-id-block">
            <span className="field-label">Simulated Pact ID</span>
            <p className="sim-id-text">{SAMPLE_PACT_ID}</p>
          </div>
          <div className="sim-stamp-wrap">
            <span
              className="stamp"
              data-state={s.state}
              data-ink={s.state === "refunded" ? "red" : "teal"}
            >
              {s.badge}
            </span>
          </div>
        </div>

        <div className="sim-pipeline">
          <div className="sim-pipe-step">
            <span className="field-label">1. Locked Escrow</span>
            <span className="sim-pipe-val">{s.cap}</span>
          </div>
          <div className="sim-pipe-step">
            <span className="field-label">2. Verifier Verdict</span>
            <span className="sim-pipe-val">{s.verdict}</span>
          </div>
          <div className="sim-pipe-step">
            <span className="field-label">3. Settlement Execution</span>
            <span className="sim-pipe-val">{s.action}</span>
          </div>
        </div>

        <div className="sim-balances">
          <div className="sim-balance-card">
            <span className="field-label">Paid to Seller</span>
            <span className="sim-balance-amount" data-role="seller">
              {s.seller}
            </span>
          </div>
          <div className="sim-balance-card">
            <span className="field-label">Refunded to Buyer</span>
            <span className="sim-balance-amount" data-role="buyer">
              {s.buyer}
            </span>
          </div>
        </div>

        <div className="sim-quote" role="note">
          &ldquo;{s.quote}&rdquo;
        </div>

        <details className="raw-event">
          <summary>On-chain settlement event payload</summary>
          <pre>{JSON.stringify(s.payload, null, 2)}</pre>
        </details>

        <div className="sim-footer">
          <span className="mono">{s.hashMeta}</span>
          <a href={`/pact/${SAMPLE_PACT_ID}`}>Inspect sample pact in Explorer &rarr;</a>
        </div>
      </div>
    </div>
  );
}
