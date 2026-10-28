# Pactwright — Architecture Essentials (v0.2)

> Quick reference for agents. Critical decisions only. Details: [`ARCHITECTURE.md`](ARCHITECTURE.md) (section numbers in brackets). Scope: [`PRD.md`](PRD.md). Files: [`project_structure.md`](project_structure.md). Work: [`ROADMAP.md`](ROADMAP.md).

## 0. Process rule (mandatory)
- **Every contribution updates `ROADMAP.md`:** task status, progress counts, integration coverage if relevant, and one Update log line. No exceptions. A PR without it fails `roadmap-check`. Details: [`AGENTS.md`](AGENTS.md) §1.
- Design changes: ADR first, then update these docs + `ROADMAP.md` in the same PR.

## 1. What it is
- Accountable AI-agent purchases on Stellar: condition frozen → pay → deliver (signed receipt) → verify → settle / refund / release → receipt.
- **MVP = Accensa + Tollcraft + Witness format.** Add-ons later: Vespi, Pollar (v1), Ficha-style meter demo (v1), BookerBob (v2).

## 2. Repos [project_structure.md]
- `pactwright-contracts` — `pact` escrow contract; **owns hashing + `test-vectors/`** (ADR-015).
- `pactwright-kit` — `core`, `contracts-client`, `agent`, `seller`, `mcp`, `adapters`, `cli`; service `verifier`.
- `pactwright-studio` — indexer, anchorer, pact page, certificate viewer.
- Contributed to `accensa/x402-facilitator-stellar`: `pact` scheme + `/pact/submit` (ADR-004). **No relayer.**

## 3. Modes [§2] — ADR-001
- **M0 exact-refund:** standard `exact`; DENY/partial → seller's `RefundVault.refund`. **Seller-cooperative; never call it guaranteed.**
- **M2 escrow:** `pact` holds the cap. ALLOW → seller settles `actual`, rest back. DENY / silence / deadline → buyer. Guaranteed both ways. Testnet until audit.
- **Metered** = M2 + `MeterTerms`; signed usage vouchers; **no verdict**.
- **M1 (`upto`) is deferred.** Don't build it (ADR-002 superseded).

## 4. Non-negotiable rules
- **No admin path to funds.** Admin can only `set_verifier` (new pacts only).
- One transition = one tx = one event. Exactly one terminal state (`Settled` | `Released`).
- `paid_to_seller + returned_to_buyer == cap`.
- **One attestation per pact.** A second `record_verdict` must fail.
- **Two deadlines:** `verdict_deadline` (record_verdict), `settle_deadline` (settle / close_meter). Never one expiry for both.
- `release` (permissionless) when: Denied · or silence=Refund ∧ Funded ∧ past verdict deadline · or (Funded ∨ Allowed) ∧ past settle deadline.
- `open` rejects `cap ≤ 0`, buyer = seller, bad deadlines, reused `pact_id`. Only `config.token` (USDC).
- TTL at `open` covers `settle_deadline + GRACE`.
- **Buyer submits evidence.** The seller signs a delivery receipt over the exact body.
- `panic_with_error!` only; no unbounded instance storage; every entrypoint has a `#[budget_*]` test; cost-lint must pass.

## 5. Hashing [§4.3] — byte-identical in Rust and TS, tested against `test-vectors/`
- `nonce = u64_be(sha256(idempotency_key)[0..8])`
- `pact_id = sha256(xdr(buyer) ‖ xdr(seller) ‖ nonce ‖ condition_hash)`
- Verdict msg `sha256("pactwright-verdict-v1:" ‖ xdr(VerdictAttestation))`
- Usage msg `sha256("pactwright-usage-v1:" ‖ xdr(UsageVoucher))`
- Delivery msg `sha256("pactwright-delivery-v1:" ‖ pact_id ‖ sha256(body))`
- Leaf `sha256("pactwright-receipt-v1" ‖ pact_id ‖ transition ‖ to_seller ‖ to_buyer ‖ envelope_hash|0 ‖ ledger)` — **one per terminal transition** (paid, settled, released, refunded).
- Merkle: sorted-pair SHA-256 (= Accensa `ReceiptAnchor` / `verifyReceipt()`).

## 6. `pact` contract [§4]
- Entrypoints: `__constructor`, `set_verifier`, `open(OpenParams)`, `record_verdict`, `settle` (seller), `close_meter` (seller), `release`, `get_pact`, `get_config`, `extend_pact_ttl`.
- States: `Funded → Allowed | Denied → Settled | Released`; metered: `Funded → Settled | Released`.
- Types: `OpenParams`, `Pact`, `VerdictAttestation` (with `amount` for partial delivery), `UsageVoucher`, `Metering{None | Units(MeterTerms{unit_price, meter_key})}`, `Silence{Refund, Pay}`, `Config{admin, token, verifier, max_pact_ledgers}`.
- Events `("pact", opened|verdict|settled|meter_closed|released|verifier_set)`.

## 7. Facilitator `pact` scheme [§6.4]
- `/verify`: exactly `pact.open` on the configured contract; `seller == payTo`, `cap == amount`, `condition_hash == hash(condition)`, only sub-invocation `token.transfer(buyer → pact, cap)`, facilitator not a party, seller trustline present.
- `/settle` = **fund the escrow**, then the seller delivers.
- `/pact/submit`: sponsored `record_verdict | settle | close_meter | release | extend_pact_ttl` for the configured contract only.

## 8. Verifier [§6.5]
- Witness verdict-v1 envelope (unchanged schema); M2 also gets one `VerdictAttestation`.
- Checks the delivery receipt first; the model reads into a structured output (pinned model, explicit `effort`, **no `temperature`**: the API rejects sampling params); **rules decide**; model ID, effort + raw-output hash in the envelope. A model refusal = no verdict (silence policy applies).
- Non-delivery: no delivery receipt within the timeout → DENY.
- `verify.minAmount` per route: below it, receipt only.

## 9. Money and accounts [§6.2] — ADR-006
- Agent accounts created with **sponsored reserves** + USDC trustline.
- Balance = ceiling; budgets are topped up; revoke = stop topping up (true revoke = smart accounts, P2).
- Seller keys in KMS.

## 10. Receipts [§6.6]
- Indexer: RPC `getEvents` + **backfill** from a history source; alert at 50% of RPC retention.
- Anchorer: **reconcile from chain first**; batch ≤ `get_max_batch_size()`; respect `min_anchor_interval`.
- Certificates: `pending` → `anchored`.

## 11. Interfaces [§8]
- 402: `accepts[].extra.pactwright` (v2): mode, condition, deliveryKey, verifier, verifierUrl, verify, pactContract, silence, deadlines, refundVault, refundWindowLedgers, meter. M0 uses scheme `exact`; M2 scheme `pact`.
- Headers: `X-Pactwright-Idempotency`, `X-Pactwright-Pact`, `X-Pactwright-Delivery`.
- Verifier: `POST /v1/verdicts`, `GET /v1/envelopes/:sha256`, `GET /health`, seller webhook.
- MCP: `pactwright_find_sellers | buy | get_pact | dispute | get_certificate`. Metering runs in the SDK loop, not MCP.
- Adapters: `Discovery`, `Reputation`, `Gate`, `Wallet`, `Verifier`. MVP implementations are first-party.

## 12. Data [§7]
- MVP Postgres (6 tables): `pacts`, `pact_events`, `verdicts` (unique `pact_id, milestone`), `receipt_batches`, `receipts` (**not** unique on `pact_id`), `sync_state`.
- P1: `sellers`, `routes`, `agents`, `budgets`.
- Amounts: `i128` stroops on-chain · decimal strings in TS (convert only in `core/amounts.ts`) · `numeric(30,7)` in SQL.

## 13. Stack [§11]
- Rust, `soroban-sdk` 28.x, `wasm32v1-none`; Accensa `RefundVault` + `ReceiptAnchor` as pinned WASM.
- Tollcraft cost-lint Action (PR) + `#[budget_*]` + `cargo budget-report --check` (post-merge), baselines × 1.15.
- Node 24, TS strict, pnpm, zod 4, Hono (verifier), Express middleware, `@stellar/stellar-sdk`, `@x402/*`, `@accensa/sdk`, MCP SDK.
- Next.js + Postgres; S3-compatible evidence store; verifier LLM provider + model pinned in config.

## 14. Security [§9]
- Domain-separated signatures bound to `pact_id` + `condition_hash`; verifier key snapshotted per pact.
- Pinned WASM hashes checked in CI. Startup fails if network config is incomplete.
- Residual risks (documented): M0 refunds are seller-cooperative; `release` cannot pay a frozen buyer account.

## 15. Licensing
- `NOTICE` credits all seven projects. Witness core vendored (Apache-2.0). Ficha = idea only. **Pollar Studio: SDK + partnership only.**

## 16. Open questions [PRD §12]
- Pollar auth-entry signing (add-on only) · BookerBob contract admin (P2) · `@witness/core` packaging · mainnet verifier operators · `RefundVault` refund-only key · default deadline lengths.
