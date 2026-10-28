# pactwright-studio — Roadmap

> **⚠ Every contribution updates this file:** task status, progress counts and one
> Update log line. CI (`roadmap-check`) fails PRs that don't. Rules: [`AGENTS.md`](AGENTS.md) §1.
> Task IDs are global; the master roadmap lives in the Pactwright workspace and is synced weekly (XC-12).

| | |
|---|---|
| Last updated | 2026-10-28 |
| Progress | **11 / 20 tasks (55%)** |

Legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[-]` dropped (ADR) · owner `core`/`wave` · size `T`/`M`/`H`.

## Progress summary

| Section | Tasks | Done | % |
|---|---|---|---|
| Foundations (this repo) | 6 | 2 | 33% |
| Phase 5 — Studio MVP | 10 | 8 | 80% |
| Phase 7 — v1 | 2 | 0 | 0% |
| Phase 9 — v2 | 1 | 0 | 0% |
| Cross-cutting | 1 | 1 | 100% |

## Foundations (this repo)

Repo-level setup tasks.

- [x] **F-02** Create the 3 repos with licenses (contracts MIT, kit Apache-2.0, studio MIT), README skeleton, `NOTICE` crediting all 7 projects — core · T · F-01 · project_structure §6 (pushed, 2026-10-28)
- [x] **F-03** Add `ROADMAP.md`, `AGENTS.md`, `CONTRIBUTING.md` (with the roadmap rule) and copies of the 4 design docs to each repo — core · T · F-02 · Done when: every repo states the roadmap rule. (pushed, 2026-10-28)
- [~] **F-04** Labels (`Stellar Wave`, `complexity:*`, `area:*`, `good first issue`, `core-team-only`), issue template, PR template with a "ROADMAP.md updated" checkbox — core · T · F-02 · project_structure §7
- [~] **F-05** `roadmap-check` CI workflow in all 3 repos: fails a PR that doesn't modify `ROADMAP.md` — core · M · F-02 · Done when: a PR without a roadmap change fails CI.
- [~] **F-06** `CODEOWNERS` for core-team-only paths — core · T · F-02 · project_structure §7
- [ ] **F-07** OpenSSF Scorecard, Dependabot, branch protection (CI + review required) — core · T · F-02

## Phase 5 — Studio MVP

Public pact pages and certificates backed by an indexer and anchorer.

- [x] **S-01** Next.js scaffold, `db.ts`, `001_core.sql`, `migrations.yml` — wave · M · F-02 · ARCH §7.3 (#18, 2026-10-28)
- [x] **S-02** Indexer: `getEvents`, cursor, idempotent writes for `pact`, facilitator and `RefundVault` events — wave · H · S-01, C-17 (#19, 2026-10-28)
- [x] **S-03** Indexer backfill from a history source + lag alert at 50% of RPC retention — wave · H · S-02 · FR-R4 (#19, 2026-10-28)
- [x] **S-04** Anchorer: reconcile from chain → batch (≤ max size, ≥ min interval) → `anchor_batch` → proofs — core · H · S-02, C-20 · FR-R1, FR-R2 (#19, 2026-10-28)
- [x] **S-05** API: `/api/pacts/:id`, `/api/certificates/:id` (`pending`/`anchored`) — wave · M · S-04 (#18, 2026-10-28)
- [x] **S-06** Pact timeline page — wave · M · S-05 · FR-I4 (#18, 2026-10-28)
- [x] **S-07** Certificate viewer: offline `verifyReceipt()` + on-chain `verify_receipt` — wave · M · S-05 · FR-R3 (#18, 2026-10-28)
- [x] **S-08** Stellar Expert links per network — wave · T · S-06 (#18, 2026-10-28)
- [ ] **S-09** Playwright e2e for both pages — wave · M · S-07
- [ ] **S-10** Deploy studio (testnet) — core · T · S-09

## Phase 7 — v1

Dashboards.

- [ ] **P7-10** `002_accounts.sql` + merchant dashboard (revenue, refund/dispute rate, cost per route from `budget-report`) — wave · H · S-05 · FR-I5
- [ ] **P7-11** Principal view (budgets, live pacts) — wave · H · P7-10

## Phase 9 — v2

- [ ] **P9-05** Pollar Studio storefront template (partnership, SDK only) — core · H · F-09 · FR-X4

## Cross-cutting

- [x] **XC-03** Monitoring: sponsor balance, indexer lag, pending certificates, verifier error rate — wave · M · S-03 (#19, 2026-10-28)

## Update log

| Date | PR / change | Tasks | Summary |
|---|---|---|---|
| 2026-10-28 | #19 | S-02, S-03, S-04, XC-03 | Implement getEvents indexer with cursor & idempotent persistence, history backfill & lag alert, anchorer with sorted-pair Merkle proofs & crash recovery, and ops health monitoring probes. |
| 2026-10-28 | #18 | S-01, S-05, S-06, S-07, S-08 | Implement migrations workflow and seed runner, API routes for pacts and certificates, public timeline page, certificate viewer with offline Merkle verification, and multi-network explorer links. |
| 2026-10-28 | ci fix | S-01 | CI failed on the initial push (no unit test files). Added `vitest.config.ts` (unit tests only) and `test/unit/explorer.test.ts`. |
| 2026-10-28 | initial push | F-02, F-03 → `[x]` | Repo published to github.com/Pactwright with licenses, NOTICE, README, CONTRIBUTING, AGENTS.md and design docs. |
| 2026-10-28 | scaffold | F-02…F-06, S-01 → `[~]` | Next.js app, API routes (501 stubs), indexer/anchorer stubs, row types; `001_core.sql` + `002_accounts.sql` applied cleanly to Postgres. |
| 2026-10-28 | scaffold | — | Repo scaffolded: structure, data models, stubs |
