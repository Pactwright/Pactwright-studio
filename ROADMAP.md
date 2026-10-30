# pactwright-studio — Roadmap

> **⚠ Every contribution updates this file:** task status, progress counts and one
> Update log line. CI (`roadmap-check`) fails PRs that don't. Rules: [`AGENTS.md`](AGENTS.md) §1.
> Task IDs are global; the master roadmap lives in the Pactwright workspace and is synced weekly (XC-12).

| | |
|---|---|
| Last updated | 2026-10-30 |
| Progress | **16 / 21 tasks (76%)** |

Legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[-]` dropped (ADR) · owner `core`/`wave` · size `T`/`M`/`H`.

## Progress summary

| Section | Tasks | Done | % |
|---|---|---|---|
| Foundations (this repo) | 6 | 4 | 67% |
| Phase 5 — Studio MVP | 11 | 9 | 82% |
| Phase 7 — v1 | 2 | 2 | 100% |
| Phase 9 — v2 | 1 | 1 | 100% |
| Cross-cutting | 1 | 0 | 0% |

## Foundations (this repo)

Repo-level setup tasks.

- [x] **F-02** Create the 3 repos with licenses (contracts MIT, kit Apache-2.0, studio MIT), README skeleton, `NOTICE` crediting all 7 projects — core · T · F-01 · project_structure §6 (pushed, 2026-10-28)
- [x] **F-03** Add `ROADMAP.md`, `AGENTS.md`, `CONTRIBUTING.md` (with the roadmap rule) and copies of the 4 design docs to each repo — core · T · F-02 · Done when: every repo states the roadmap rule. (pushed, 2026-10-28)
- [~] **F-04** Labels (`Stellar Wave`, `complexity:*`, `area:*`, `good first issue`, `core-team-only`), issue template, PR template with a "ROADMAP.md updated" checkbox — core · T · F-02 · project_structure §7
- [~] **F-05** `roadmap-check` CI workflow in all 3 repos: fails a PR that doesn't modify `ROADMAP.md` — core · M · F-02 · Done when: a PR without a roadmap change fails CI.
- [x] **F-06** `CODEOWNERS` for core-team-only paths — core · T · F-02 · project_structure §7 (#23, 2026-10-28)
- [x] **F-07** OpenSSF Scorecard, Dependabot, branch protection (CI + review required) — core · T · F-02 (#23, 2026-10-28)

## Phase 5 — Studio MVP

Public pact pages and certificates backed by an indexer and anchorer.

- [x] **S-01** Next.js scaffold, `db.ts`, `001_core.sql`, `migrations.yml` — wave · M · F-02 · ARCH §7.3 (#18, 2026-10-28)
- [x] **S-02** Indexer: `getEvents`, cursor, idempotent writes for `pact`, facilitator and `RefundVault` events — wave · H · S-01, C-17 (#25, 2026-10-29)
- [~] **S-03** Indexer backfill from a history source + lag alert at 50% of RPC retention — wave · H · S-02 · FR-R4 — reopened: the HTTP history source decoded JSON events into strings, so the decoders dropped every event while the cursor advanced (fixed in #31, plus an archival-RPC source); done once a gap is actually backfilled from a configured source
- [x] **S-04** Anchorer: reconcile from chain → batch (≤ max size, ≥ min interval) → `anchor_batch` → proofs — core · H · S-02, C-20 · FR-R1, FR-R2 (#25, 2026-10-29)
- [x] **S-05** API: `/api/pacts/:id`, `/api/certificates/:id` (`pending`/`anchored`) — wave · M · S-04 (#18, 2026-10-28)
- [x] **S-06** Pact timeline page — wave · M · S-05 · FR-I4 (#18, 2026-10-28)
- [x] **S-07** Certificate viewer: offline `verifyReceipt()` + on-chain `verify_receipt` — wave · M · S-05 · FR-R3 (#18, 2026-10-28)
- [x] **S-08** Stellar Expert links per network — wave · T · S-06 (#18, 2026-10-28)
- [x] **S-09** Playwright e2e for both pages — wave · M · S-07 (#21, 2026-10-28)
- [~] **S-10** Deploy studio (testnet) — core · T · S-09 — deployed on Render (`pactwright-studio-testnet.onrender.com`, ops health green), but the cron that calls `/api/sync` and `/api/anchor` has never run: the repo has no `STUDIO_URL` / `CRON_SECRET` secrets, and the hourly anchor wasn't scheduled (fixed in #31)
- [x] **S-11** Visual design: the pages had Tailwind class names but no styling — core · M · S-06, S-07 · Done when: every page is styled, readable at 390 px, and the e2e tests pass unchanged (#32, 2026-10-29)

## Phase 7 — v1

Dashboards.

- [x] **P7-10** `002_accounts.sql` + merchant dashboard (revenue, refund/dispute rate, cost per route from `budget-report`) — wave · H · S-05 · FR-I5 (#20, 2026-10-28)
- [x] **P7-11** Principal view (budgets, live pacts) — wave · H · P7-10 (#20, 2026-10-28)

## Phase 9 — v2

- [x] **P9-05** Pollar Studio storefront template (partnership, SDK only) — core · H · F-09 · FR-X4 (#20, 2026-10-28)

## Cross-cutting

- [~] **XC-03** Monitoring: sponsor balance, indexer lag, pending certificates, verifier error rate — wave · M · S-03 — reopened: `/api/ops/health` reported hard-coded values. Indexer lag, retention and pending certificates are now measured; sponsor balance and verifier error rate are not measured yet

## Update log

| Date | PR / change | Tasks | Summary |
|---|---|---|---|
| 2026-10-30 | deps | — | GitHub Actions: actions/checkout v7, actions/setup-node v7, pnpm/action-setup v6, in one change (replaces Dependabot #1, #2 and #3, which edit adjacent lines and would conflict with each other). |
| 2026-10-30 | #32 | — (S-11) | Design direction changed to web3 blended with the tactile pieces that carry meaning: dark block-grid base, glass panels with the brand's teal-to-indigo gradient, a holographic foil seal, neon state stamps, and the timeline as a chain of blocks. Unbounded, Manrope and JetBrains Mono (on-chain values only). |
| 2026-10-29 | #32 | S-11 → `[x]` | Studio styled for the first time: security-printing design (cheque paper, guilloché, foil seal, rubber-stamp states, perforated timeline stubs), pact lookup and recent-pacts ledger on the home page, plain-language amounts and events (`lib/format.ts`). |
| 2026-10-29 | #31 | S-03 → `[~]` | Crosscheck: the HTTP history source returned JSON, so `pact_id` arrived as text and every backfilled event was dropped while the cursor advanced; it now reads base64-XDR events, requires `scannedThroughLedger`, and an archival-RPC source (`HISTORY_RPC_URL`) is added. `studio-cron` never ran (no secrets) and silently skipped when unconfigured; it now fails loudly and schedules the hourly anchor. |
| 2026-10-29 | #30 | S-10 stays `[~]` | Adjust Render Blueprint to free tier (`plan: free` for web and Postgres DB) and add GitHub Actions `studio-cron` workflow for 5-min indexer sync and hourly anchor triggers without requiring a credit card. (refs #26) |
| 2026-10-29 | #29 | S-03 → `[x]` | History-source backfill: fetch historical `pact` and RefundVault events via HistorySource when cursor is behind RPC retention, decode and persist idempotently, advance cursor only through verified scanned ledgers; `syncWithHistory` resumes RPC sync without skipping any events. |
| 2026-10-29 | Render deploy (#26) | XC-03 → `[~]`; S-10 stays `[~]` | `render.yaml` for testnet on Render: web app (migrations before each deploy), managed Postgres, `/api/sync` every 5 min and `/api/anchor` hourly with a generated `CRON_SECRET`; secrets stay in Render. `/api/ops/health` returned hard-coded numbers; it now measures indexer lag from the slowest cursor, RPC retention and the unanchored-receipt backlog, and runs no probe it can't measure. |
| 2026-10-29 | #25 | S-02, S-04 → `[x]`; S-03 → `[~]` | Indexer reads real `pact` and RefundVault events via RPC `getEvents` (one cursor per source, one DB transaction per event, idempotent). Receipt leaves now match the contract byte for byte (they were colon-joined text before), tested against its vectors. Anchorer sends real `anchor_batch` with the ReceiptAnchor admin key, records each plan first and reconciles plans with the chain. Live testnet run: 9 pacts indexed, batch 1 anchored (tx `be51068e…`), every proof verified by ReceiptAnchor's `verify_receipt`; rerun changed nothing. Migration 003 drops shards (v0.2.0 has none) and keeps leaf inputs per receipt; the migration runner applies each file once. Cron routes fail closed without CRON_SECRET. Backfill no longer skips gaps. |
| 2026-10-29 | #24 | — (L-01, master) | README links the 7 MVP scenarios run on testnet by Pactwright-Kit's e2e; these are the first pacts for the indexer and anchorer to pick up. |
| 2026-10-29 | #24 | S-02, S-04, S-10 → `[~]` | Reopened tasks whose done-criteria weren't met: the indexer doesn't read the chain, the anchorer doesn't anchor, and Studio isn't deployed. The real work follows in the next PRs. |
| 2026-10-28 | #23 | F-06, F-07 → `[x]` | README rewritten to explain Studio: why it exists, who uses it, how a receipt becomes provable (flowchart), an honest status table (RPC `fetchEvents` and on-chain `anchor_batch` are still stubs; not deployed), pages and API, local run, deploy, data model, FAQ, and a full License section. Logo assets added. CODEOWNERS, Scorecard and branch protection are live. |
| 2026-10-28 | #21 | S-09, S-10 | Add Playwright e2e tests for pact timeline and certificate viewer, enable e2e CI workflow, add testnet deployment guide and vercel cron config. |
| 2026-10-28 | scorecard + teams | F-06, F-07 → `[~]` | OpenSSF Scorecard workflow and badge; CODEOWNERS uses `@Pactwright/maintainers` / `@Pactwright/core`; branch-protection and Dependabot policy in CONTRIBUTING. Done once all three repos merge and protection is on (Pactwright-contracts#58). |
| 2026-10-28 | #20 | P7-10, P7-11, P9-05 | Implement merchant dashboard (revenue, dispute/refund rates, route breakdown), principal view (budgets & live pacts), and Pollar Studio storefront template. |
| 2026-10-28 | #19 | S-02, S-03, S-04, XC-03 | Implement getEvents indexer with cursor & idempotent persistence, history backfill & lag alert, anchorer with sorted-pair Merkle proofs & crash recovery, and ops health monitoring probes. |
| 2026-10-28 | #18 | S-01, S-05, S-06, S-07, S-08 | Implement migrations workflow and seed runner, API routes for pacts and certificates, public timeline page, certificate viewer with offline Merkle verification, and multi-network explorer links. |
| 2026-10-28 | ci fix | S-01 | CI failed on the initial push (no unit test files). Added `vitest.config.ts` (unit tests only) and `test/unit/explorer.test.ts`. |
| 2026-10-28 | initial push | F-02, F-03 → `[x]` | Repo published to github.com/Pactwright with licenses, NOTICE, README, CONTRIBUTING, AGENTS.md and design docs. |
| 2026-10-28 | scaffold | F-02…F-06, S-01 → `[~]` | Next.js app, API routes (501 stubs), indexer/anchorer stubs, row types; `001_core.sql` + `002_accounts.sql` applied cleanly to Postgres. |
| 2026-10-28 | scaffold | — | Repo scaffolded: structure, data models, stubs |
