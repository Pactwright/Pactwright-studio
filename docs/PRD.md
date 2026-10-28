# Pactwright — Product Requirements Document

> **Every agent purchase is a pact. Pactwright makes sure it is kept.**

| | |
|---|---|
| Status | Draft v0.2 — 2026-10-28 (design review accepted; see §13) |
| Owners | Accensa + Tollcraft maintainers |
| Repos | `pactwright/pactwright-contracts` · `pactwright/pactwright-kit` · `pactwright/pactwright-studio` (+ a `pact` scheme contributed to `accensa/x402-facilitator-stellar`) |
| Network | Stellar (Soroban) — testnet first |
| Companion docs | [`ARCHITECTURE.md`](ARCHITECTURE.md) · [`ARCHITECTURE_ESSENTIALS.md`](ARCHITECTURE_ESSENTIALS.md) · [`project_structure.md`](project_structure.md) · [`ROADMAP.md`](ROADMAP.md) |
| Process | **Every contribution updates [`ROADMAP.md`](ROADMAP.md)** (task status, counts, Update log). See [`AGENTS.md`](AGENTS.md) §1. |

---

## 1. Summary

Pactwright makes purchases by AI agents on Stellar accountable. A purchase becomes a
**pact**: the delivery is checked against a condition frozen before payment, the money
moves only according to the verdict, and every outcome gets a receipt anyone can verify.

**The MVP is built on three things:** Accensa (x402 facilitator, `RefundVault`,
`ReceiptAnchor`, `@accensa/sdk`), Tollcraft (cost lint + budget assertions) and the Witness
verdict format. **Add-ons** from the HackMeridian 2026 ecosystem come after the core works:

| Stage | MVP | Add-on (later) |
|---|---|---|
| Find | Accensa Bazaar | **BookerBob** proven-customer ranking |
| Approve | Budget funded by the principal (CLI) | **Vespi** budget approval · **Pollar** seedless funding wallet |
| Pay | Accensa facilitator (`exact` and new `pact` scheme) | — |
| Meter | Signed usage vouchers (credit: **Ficha**'s per-unit refunds) | Ficha-style physical demo |
| Verify | Witness-compatible verifier | — |
| Settle / refund / receipt | `pact` escrow, `RefundVault`, `ReceiptAnchor` | — |
| Guard | Tollcraft gates on every contract | — |
| Review | — | Proof-of-purchase reviews (BookerBob), P2 |

## 2. Problem

Agents can pay for things on Stellar today (x402), but an agent purchase has no recourse:
payment moves before delivery, "delivered" is whatever the seller's API says, refunds
depend on goodwill, usage-based services charge up front, and receipts come from the
seller's own server. The strongest HackMeridian 2026 submissions (Witness, Ficha, Vespi,
BookerBob, Pollar Studio) each built a home-made fix for one part of this. None of them
is reusable as a whole.

## 3. Goals and non-goals

### Goals
- **G1.** An agent buys through one SDK/MCP call and gets a verified outcome and a receipt.
- **G2.** A seller protects an existing x402 endpoint with one middleware call.
- **G3.** Every terminal transition (paid, settled, released, refunded) yields a receipt verifiable offline and on-chain.
- **G4.** The agent cannot spend beyond the budget a human funded.
- **G5.** No contract merges without passing Tollcraft cost gates.
- **G6.** Each guarantee is stated honestly per mode.

### Non-goals (v1)
- Allowance-based payments (`upto`): deferred until Accensa's ADR-002 resolves (see §13).
- A facilitator of our own: we contribute a scheme to Accensa's.
- A wallet: agents use funded keypairs; humans use their existing wallet (Pollar as add-on).
- Human arbitration: disputes are re-verifications.
- Custody on mainnet before an audit.
- Per-purchase human approvals.
- Cross-chain.

## 4. Users

| Persona | Need |
|---|---|
| **Agent operator** (primary) | Buy safely from code or MCP: verified, refundable, receipted |
| **Principal** | Fund an agent with a budget once; never buy XLM; see every pact |
| **Seller** (primary) | Protect an endpoint in one line; get paid reliably; bounded refunds |
| **Metered seller** | Charge per unit actually used (minutes, pages, calls) |
| **Verifier operator** | Run a Witness-compatible verifier with a known key |
| **Ecosystem contributor** | Well-scoped Drips Wave issues in three public repos |

## 5. Modes and lifecycle

| Mode | How money moves | Buyer guarantee | Seller guarantee |
|---|---|---|---|
| **M0 — exact-refund** | Standard x402 `exact`; DENY → refund from the seller's `RefundVault` | **Refund-promised (seller-cooperative)**, bounded by the seller's vault float | Paid up front |
| **M2 — escrow** | `pact` contract holds the cap; ALLOW → `actual` to seller, rest back; DENY / silence / deadline → back to buyer | **Guaranteed** | **Guaranteed** once ALLOW or signed usage is recorded |

```
M0:  402 → pay exact → delivered (+ signed delivery receipt) → [verify] → ALLOW: done │ DENY/partial: refund
M2:  402 → open (escrow funded) → delivered → verdict ─ ALLOW → settle ─▶ SETTLED
                                                       ├ DENY ─────────▶ RELEASED
                                                       └ none by verdict deadline → silence policy (refund | pay)
     metered M2: open → signed usage vouchers → close_meter ─▶ SETTLED (no verdict)
     any M2 pact still open after settle deadline ─▶ RELEASED to buyer
every terminal transition ─▶ receipt leaf ─▶ anchored batch ─▶ Pact Certificate
```

## 6. Functional requirements

Priority: **P0** = MVP · **P1** = v1 · **P2** = later.

### 6.1 Discovery
| ID | Requirement | P |
|---|---|---|
| FR-D1 | Agents search sellers via the Accensa Bazaar and filter to Pactwright-protected resources. | P0 |
| FR-D2 | Listings show mode, verifier, silence policy, deadlines, refund window and (M0) vault float. | P0 |
| FR-D3 | Ranking by BookerBob proven-customer reputation, weighted by unique buyers, account age and amount; self-purchases ignored. | P2 |

### 6.2 Budget
| ID | Requirement | P |
|---|---|---|
| FR-A1 | `pactwright agent create` creates an agent account with sponsored reserves and a USDC trustline; nobody buys XLM. | P0 |
| FR-A2 | The principal funds the agent with the budget; the agent's balance is the ceiling. | P0 |
| FR-A3 | Budgets are topped up in small amounts; "revoke" means stop topping up. | P0 |
| FR-A4 | Budget approval through the Vespi gate; funding from a Pollar wallet. | P1 |
| FR-A5 | Immediate revoke of unspent budget (requires smart accounts). | P2 |

### 6.3 Payment
| ID | Requirement | P |
|---|---|---|
| FR-P1 | Seller 402 responses carry `extra.pactwright` (mode, condition template, delivery key, verifier, deadlines, silence, refund window). | P0 |
| FR-P2 | M0 pays with the standard `exact` scheme; clients unaware of Pactwright still pay normally. | P0 |
| FR-P3 | M2 pays with a `pact` x402 scheme in the Accensa facilitator, where "settle" funds the escrow before delivery. | P0 |
| FR-P4 | Fees are sponsored by the facilitator; the buyer needs only USDC. | P0 |
| FR-P5 | Retries never create a second pact: `nonce` derives from an idempotency key. | P0 |
| FR-P6 | Rejected at open: `cap ≤ 0`, buyer = seller, tokens other than the configured USDC, deadlines out of bounds. | P0 |
| FR-P7 | The facilitator checks the seller's USDC trustline before accepting an M2 payment. | P0 |

### 6.4 Delivery and verification
| ID | Requirement | P |
|---|---|---|
| FR-V1 | The condition is frozen by hash before payment. | P0 |
| FR-V2 | Every paid response carries a seller-signed delivery receipt over the exact body. | P0 |
| FR-V3 | **The buyer** submits evidence (body + delivery receipt) to the verifier. | P0 |
| FR-V4 | Verdicts are ALLOW/DENY with an amount (partial delivery) and criteria scores, in Witness verdict-v1 envelopes. | P0 |
| FR-V5 | Deterministic rules decide; the model only reads into a structured output (pinned model and explicit effort; model ID, effort and raw-output hash recorded). A model refusal produces no verdict. | P0 |
| FR-V6 | Non-delivery: no delivery receipt within the timeout → DENY. | P0 |
| FR-V7 | Each route sets `verify.minAmount`; below it, pacts are receipted but not verified. | P0 |
| FR-V8 | At most one verdict attestation per pact; one verifier key, snapshotted per pact, rotatable for new pacts. | P0 |
| FR-V9 | Anyone can check an envelope offline with one CLI command. | P0 |
| FR-V10 | Evidence retention limit, redaction hook, and disclosure of what is sent to the model. | P1 |

### 6.5 Settlement, deadlines, refunds
| ID | Requirement | P |
|---|---|---|
| FR-S1 | M2: ALLOW → seller settles `actual ≤ amount`; the remainder returns to the buyer in the same transaction. | P0 |
| FR-S2 | M2: DENY → anyone can release the full escrow to the buyer. | P0 |
| FR-S3 | M2 has a verdict deadline and a settle deadline; with no verdict, the agreed silence policy applies (refund by default, or pay). | P0 |
| FR-S4 | M2: any pact still open after its settle deadline can be released to the buyer by anyone. | P0 |
| FR-S5 | M0: DENY or partial delivery → the seller middleware refunds through `RefundVault` automatically. | P0 |
| FR-S6 | Disputes after a terminal state trigger re-verification within the refund window; a reversed verdict refunds via `RefundVault` (seller-cooperative). | P1 |
| FR-S7 | Seller keys are held in KMS, never on disk. | P1 |

### 6.6 Metering
| ID | Requirement | P |
|---|---|---|
| FR-M1 | Sellers declare a metered route (unit, unit price) in M2. | P1 |
| FR-M2 | The buyer's SDK signs cumulative usage vouchers with a per-pact key and never signs beyond the cap. | P1 |
| FR-M3 | The seller closes the meter with the latest voucher; one signature check on-chain; no verdict needed. | P1 |

### 6.7 Receipts
| ID | Requirement | P |
|---|---|---|
| FR-R1 | One receipt leaf per terminal transition (a pact can be paid and later refunded). | P0 |
| FR-R2 | Leaves are anchored in batches in `ReceiptAnchor`; certificates show `pending` until anchored. | P0 |
| FR-R3 | Certificates verify offline (`verifyReceipt()`) and on-chain (`verify_receipt`). | P0 |
| FR-R4 | The indexer backfills from a history source if it falls behind RPC retention. | P0 |

### 6.8 Interfaces
| ID | Requirement | P |
|---|---|---|
| FR-I1 | TypeScript SDK (`@pactwright/agent`, `@pactwright/seller`). | P0 |
| FR-I2 | MCP tools: find sellers, buy, get pact, dispute, get certificate. | P0 |
| FR-I3 | Express middleware (P0); Hono middleware (P1). | P0/P1 |
| FR-I4 | Studio: public pact timeline and certificate viewer. | P0 |
| FR-I5 | Studio: merchant dashboard (revenue, refund and dispute rates, cost per route) and principal view. | P1 |

### 6.9 Add-ons
| ID | Requirement | P |
|---|---|---|
| FR-X1 | Ficha-style metered demo (pay-per-minute) on M2 metering. | P1 |
| FR-X2 | BookerBob ranking adapter. | P2 |
| FR-X3 | Proof-of-purchase reviews: buyer commitments added in delayed, shuffled batches. | P2 |
| FR-X4 | Pollar Studio storefront template (SDK + partnership only). | P2 |

## 7. Non-functional requirements

| Area | Requirement |
|---|---|
| Security | No admin path to pact funds; domain-separated signatures bound to `pact_id` + `condition_hash`; single attestation per pact |
| Honesty | Listings and docs state the guarantee of each mode; M0 is never called "guaranteed" |
| Custody | M2 on testnet until audited; audit scope includes the Accensa contracts called |
| Cost | Every entrypoint has a Tollcraft budget test; `settle` and `close_meter` < 1% of a 1 USDC pact |
| Latency | M2 funding ≈ one ledger (~5 s); verification < 30 s for documents |
| Availability | A silent verifier or seller never strands funds (deadlines + silence policy) |
| Privacy | Hashes on-chain only; evidence retention limits; review batching (P2) |
| Interoperability | Standard x402; Witness verdict-v1; Accensa receipt Merkle format |
| Licensing | Credit all seven projects in `NOTICE`; Pollar Studio only via SDK + partnership |

## 8. Success metrics

| Metric | MVP | v1 |
|---|---|---|
| Testnet pacts (M0 + M2) | 100 | 1,000 |
| Mainnet pacts (M0) | — | 250 |
| Independent sellers | 3 | 15 |
| Verdict accuracy on the labelled set | 90% | 97% |
| Median open → terminal | < 2 min | < 1 min |
| `settle` cost as % of a 1 USDC pact | < 1% | < 0.5% |
| Drips Wave issues resolved (3 repos + facilitator) | 30 | 120 |

## 9. Release plan

| Release | Scope | Maps to |
|---|---|---|
| **MVP** | M0 + M2 (verdict) on testnet; `pact` scheme in the Accensa facilitator; verifier with one condition kind; receipts and certificates; SDK, MCP, Express middleware; studio pact page + certificate viewer. **Accensa + Tollcraft + Witness.** | SCF tranche 1 · Drips applications |
| **v1** | Metering; disputes; Hono; merchant and principal views; KMS; evidence privacy; M0 on mainnet via a production facilitator. **Add-ons: Vespi, Pollar, Ficha-style demo.** | SCF tranche 2 · hackathon pre-work |
| **v1.1** | Audit; M2 on mainnet; Accensa facilitator hardened for production. | SCF tranche 3 · hackathon goals |
| **v2** | BookerBob ranking and proof-of-purchase reviews; smart-account agents (true revoke); Pollar Studio template; M1 if `upto` is resolved. | Post-SCF |

### Hackathon goals (Scale path, declared before the event)
1. First M2 pact settled on mainnet after audit (or M0 on mainnet if the audit isn't finished).
2. An AI agent buys through MCP, receives a DENY and gets its escrow back on stage.
3. A metered pay-per-minute demo with Pollar funding and Vespi budget approval.

## 10. Dependencies

| Dependency | License | Use | Phase |
|---|---|---|---|
| Accensa `x402-facilitator-stellar` | Apache-2.0 | `exact` + new `pact` scheme, `/pact/submit`, Bazaar | MVP |
| Accensa `accensa-contracts` | MIT | `RefundVault`, `ReceiptAnchor` (pinned WASM) | MVP |
| Accensa `accensa-app` | MIT | `@accensa/sdk` (`verifyReceipt`, `createSettleHook`) | MVP |
| Tollcraft `soroban-cost-linter` | Apache-2.0 | CI Action | MVP |
| Tollcraft `soroban-budget-assert` | MIT | Budget macros, `cargo budget-report` | MVP |
| Witness | Apache-2.0 | verdict-v1 format, verify-cli (vendored) | MVP |
| Vespi | Apache-2.0 | Budget gate | v1 |
| Pollar | SDK terms | Principal funding wallet | v1 |
| Ficha | MIT | Per-unit refund idea (credited, not copied) | v1 |
| BookerBob | MIT | Ranking, Semaphore groups | v2 |
| Accensa `upto-authorization` | MIT | M1 | Deferred |

## 11. Risks

| Risk | Mitigation |
|---|---|
| M0 refunds depend on the seller | Labelled seller-cooperative; float shown; M2 for guarantees |
| The facilitator change needs Accensa maintainers' review | Same maintainers; land it as Drips issues in an approved repo |
| Verifier mistakes or prompt injection | Rules decide; eval set in CI; disputes |
| Verification costs more than small payments | `verify.minAmount` per route |
| Hackathon add-ons go unmaintained | Adapters; MVP has no add-on dependency |
| Mainnet before audit | M2 stays on testnet; M0 uses a production facilitator |
| Frozen buyer trustline at release | Documented residual risk |

## 12. Open questions
1. Can Pollar wallets sign Soroban auth entries for arbitrary contracts? (Only affects the add-on; MVP funds agents directly.)
2. Can BookerBob group admin be a contract, or must the seller hold the key? (P2)
3. Will Witness publish `@witness/core`, or do we keep vendoring it?
4. Who operates mainnet verifiers?
5. Does `RefundVault` support a refund-only key role, or do sellers need KMS for the merchant key?
6. What are the right default deadline lengths per condition kind?

## 13. Design review outcome (2026-10-28)

All proposals from the v0.1 review were accepted. Product-level changes:

- **Modes:** M1 (allowance) dropped until `upto` is resolved; MVP = M0 + M2.
- **Honest guarantees:** M0 is "refund-promised (seller-cooperative)"; only M2 guarantees the buyer.
- **Corrected claims:** "never buy XLM" (sponsored reserves) instead of "only USDC"; revoke = stop topping up until smart accounts; reviews "cost a real purchase to fake", not "can't be bought".
- **New requirements:** delivery receipts, buyer-submitted evidence, non-delivery DENY, partial amounts, idempotency, self-dealing and token checks, verdict/settle deadlines with a silence policy, disputes, per-transition receipts, indexer backfill, verification threshold.
- **Scope cut:** MVP integrations are Accensa + Tollcraft + Witness; Pollar, Vespi, BookerBob and Ficha are add-ons. No separate relayer, no verifier registry, no per-pact approvals, signed-usage metering instead of hash chains, studio MVP = two pages.

Full mapping of every review item: [`ARCHITECTURE.md` §16](ARCHITECTURE.md).
