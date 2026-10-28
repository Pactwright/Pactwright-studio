# pactwright-studio — Roadmap

> **⚠ Every contribution updates this file:** task status, progress counts and one
> Update log line. CI (`roadmap-check`) fails PRs that don't. Rules: [`AGENTS.md`](AGENTS.md) §1.
> Task IDs are global; the master roadmap lives in the Pactwright workspace and is synced weekly (XC-12).

| | |
|---|---|
| Last updated | 2026-10-28 |
| Progress | **0 / 19 tasks (0%)** |

Legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[-]` dropped (ADR) · owner `core`/`wave` · size `T`/`M`/`H`.

## Progress summary

| Section | Tasks | Done | % |
|---|---|---|---|
| Foundations (this repo) | 6 | 0 | 0% |
| Phase 5 — Studio MVP | 10 | 0 | 0% |
| Phase 7 — v1 | 2 | 0 | 0% |
| Phase 9 — v2 | 1 | 0 | 0% |

## Foundations (this repo)

Repo-level setup tasks.

- [~] **F-02** Create the 3 repos with licenses (contracts MIT, kit Apache-2.0, studio MIT), README skeleton, `NOTICE` crediting all 7 projects — core · T · F-01 · project_structure §6
- [~] **F-03** Add `ROADMAP.md`, `AGENTS.md`, `CONTRIBUTING.md` (with the roadmap rule) and copies of the 4 design docs to each repo — core · T · F-02 · Done when: every repo states the roadmap rule.
- [~] **F-04** Labels (`Stellar Wave`, `complexity:*`, `area:*`, `good first issue`, `core-team-only`), issue template, PR template with a "ROADMAP.md updated" checkbox — core · T · F-02 · project_structure §7
- [~] **F-05** `roadmap-check` CI workflow in all 3 repos: fails a PR that doesn't modify `ROADMAP.md` — core · M · F-02 · Done when: a PR without a roadmap change fails CI.
- [~] **F-06** `CODEOWNERS` for core-team-only paths — core · T · F-02 · project_structure §7
- [ ] **F-07** OpenSSF Scorecard, Dependabot, branch protection (CI + review required) — core · T · F-02

## Phase 5 — Studio MVP

Public pact pages and certificates backed by an indexer and anchorer.

- [~] **S-01** Next.js scaffold, `db.ts`, `001_core.sql`, `migrations.yml` — wave · M · F-02 · ARCH §7.3
- [ ] **S-02** Indexer: `getEvents`, cursor, idempotent writes for `pact`, facilitator and `RefundVault` events — wave · H · S-01, C-17
- [ ] **S-03** Indexer backfill from a history source + lag alert at 50% of RPC retention — wave · H · S-02 · FR-R4
- [ ] **S-04** Anchorer: reconcile from chain → batch (≤ max size, ≥ min interval) → `anchor_batch` → proofs — core · H · S-02, C-20 · FR-R1, FR-R2
- [ ] **S-05** API: `/api/pacts/:id`, `/api/certificates/:id` (`pending`/`anchored`) — wave · M · S-04
- [ ] **S-06** Pact timeline page — wave · M · S-05 · FR-I4
- [ ] **S-07** Certificate viewer: offline `verifyReceipt()` + on-chain `verify_receipt` — wave · M · S-05 · FR-R3
- [ ] **S-08** Stellar Expert links per network — wave · T · S-06
- [ ] **S-09** Playwright e2e for both pages — wave · M · S-07
- [ ] **S-10** Deploy studio (testnet) — core · T · S-09

## Phase 7 — v1

Dashboards.

- [ ] **P7-10** `002_accounts.sql` + merchant dashboard (revenue, refund/dispute rate, cost per route from `budget-report`) — wave · H · S-05 · FR-I5
- [ ] **P7-11** Principal view (budgets, live pacts) — wave · H · P7-10

## Phase 9 — v2



- [ ] **P9-05** Pollar Studio storefront template (partnership, SDK only) — core · H · F-09 · FR-X4

## Update log

| Date | PR / change | Tasks | Summary |
|---|---|---|---|
| 2026-10-28 | scaffold | F-02…F-06, S-01 → `[~]` | Next.js app, API routes (501 stubs), indexer/anchorer stubs, row types; `001_core.sql` + `002_accounts.sql` applied cleanly to Postgres. |
| 2026-10-28 | scaffold | — | Repo scaffolded: structure, data models, stubs |
