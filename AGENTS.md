# AGENTS.md — instructions for AI agents and contributors

These rules apply to every change in the Pactwright workspace and in each of its repos
(`pactwright-contracts`, `pactwright-kit`, `pactwright-studio`).

## 1. Update `ROADMAP.md` in every contribution (mandatory)

**Every contribution must update `ROADMAP.md`. No exceptions:** code, tests, docs, CI,
config, dependency bumps, refactors.

Before you finish any change:
1. Set the status of each task you touched (`[ ]` → `[~]` → `[x]`, adding `(#PR, YYYY-MM-DD)` when done).
2. If no task matches your change, add one in the right phase with the next free ID and the full format.
3. Update the Progress summary counts, "Overall progress" and "Last updated".
4. If the change affects a source project's feature (Accensa, Tollcraft, Witness, Vespi, Pollar, Ficha, BookerBob), update the Integration coverage table.
5. Append one line to the Update log (date, PR, task IDs, summary), even if no task was completed.

In a repo, edit that repo's `ROADMAP.md`. In the workspace, edit the master `ROADMAP.md`.
A PR without a `ROADMAP.md` change fails the `roadmap-check` CI job.

## 2. Read before you build
1. `ARCHITECTURE_ESSENTIALS.md`: the rules you must not break. Read it first, every time.
2. `ROADMAP.md`: find the task you are working on and its dependencies.
3. `ARCHITECTURE.md`: only the sections the essentials point you to.
4. `PRD.md`: when you need the "why" or a requirement ID.
5. `project_structure.md`: where files go.

## 3. Hard rules (summary of ARCHITECTURE_ESSENTIALS §4)
- No admin path to pact funds.
- Two modes only: M0 exact-refund (seller-cooperative) and M2 escrow. **Do not build M1 (`upto`).**
- Two deadlines (verdict, settle); never a single expiry.
- One attestation per pact. The buyer submits evidence; sellers sign delivery receipts.
- Hashing only in `hashing.rs` / `hashing.ts`, tested against `pactwright-contracts/test-vectors/`.
- Amounts: `i128` stroops on-chain, decimal strings in TS (convert only in `core/amounts.ts`).
- Every contract entrypoint has a `#[budget_*]` test; Tollcraft cost-lint must pass.
- `panic_with_error!` only; no unbounded data in instance storage.

## 4. Design changes
Any change to behavior described in the design docs needs an ADR in `docs/adr/` **before**
the code, and the same PR updates `PRD.md` / `ARCHITECTURE.md` /
`ARCHITECTURE_ESSENTIALS.md` / `project_structure.md` as needed, plus `ROADMAP.md`.

## 5. Core-team-only paths
Do not open Drips Wave issues for, and do not let Wave contributors change without core
review: `lifecycle.rs`, `verdict.rs`, `meter.rs`, `hashing.rs`, `services/verifier/src/sign.ts`,
and the facilitator `pact` scheme validation.

## 6. Pull request checklist
- [ ] `ROADMAP.md` updated (task status, counts, coverage table if relevant, Update log line)
- [ ] Tests added or updated; CI green
- [ ] Docs/ADR updated if behavior changed
- [ ] Conventional commit messages
- [ ] `NOTICE` updated if third-party code or ideas were added
