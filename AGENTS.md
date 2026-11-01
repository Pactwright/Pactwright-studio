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
- [ ] PR Malware & Supply-Chain Guard checks pass (zero Trojan Source/obfuscated characters, no raw socket or shell exfiltration, lockfile frozen)

## 7. Contributor Assignment Roster (10 Active Contributors)

To maintain clean task ownership and ensure fair, equal division of work without point-farming or overlapping claims, all 65 open issues across the three repositories are distributed equally across 10 contributors (6–7 issues per contributor). External contributors do not require repository collaborator write permissions to contribute; they apply for their assigned issues by commenting on GitHub, submit PRs from their forks, and have their work reviewed and merged through protected branch CI.

| Contributor | Focus Domain | Assigned Repos & Issue IDs | Count | Application Status |
|---|---|---|---|---|
| `@mallison031` | Core Governance & Deployments | Contracts #4, #24, #28, #35, #42, #46, #71 | 7 | Applied / Lead |
| `@MFrancis-dev` | Smart Contracts & Cryptography | Contracts #33, #34, #36, #37, #38, #40, #44 | 7 | Applied |
| `@Teescom` | Verification & Partner Integrations | Contracts #9, #10, #25, #26, #31, #45; Kit #128 | 7 | Applied |
| `@TemiMustapha` | Protocol Mechanics & SCF Grants | Contracts #27, #30, #32, #39, #41, #51 | 6 | Applied |
| `@YazarAyobami` | Kit SDK, Packaging & Verdict Store | Contracts #47, #48, #49, #50; Kit #122, #126 | 6 | Applied |
| `@OlamideAdesina` | Seller Paywalls & Metering | Kit #116, #117, #118, #119, #120; Studio #60 | 6 | Applied |
| `@pyper01` | Developer Tooling, CLI & Test Vectors | Kit #81, #112, #121, #123, #124, #125, #127 | 7 | Applied |
| `@Adediwura-dev` | Studio Frontend, Mobile & A11y | Kit #78, #79; Studio #56, #57, #58, #59 | 6 | Applied |
| `@Raheemah2k26` | Studio Anchorer & Merkle Verification | Studio #49, #50, #51, #52, #53, #54, #55 | 7 | Applied |
| `@abrcrmb` | Studio Operations & Health Probes | Studio #26, #45, #46, #47, #48, #61 | 6 | Applied |

**Total scoped issues assigned**: 65 / 65 across all repositories (100% distribution).

### Working on an Issue
1. Check the issue description and acceptance criteria in the corresponding repository.
2. Ensure your local branch is branched from clean `main`.
3. Adhere strictly to the Hard Rules in §3 and Core-Team-Only Paths in §5.
4. Open your PR against `main` using conventional commits.
5. Every PR must update `ROADMAP.md` (§1).

## 8. PR Malware & Supply-Chain Security Policy

All pull requests—especially external submissions—are scanned by automated fail-closed security guards in `.github/workflows/pr-malware-guard.yml`. PRs containing any of the following will be rejected immediately:

1. **Trojan Source & Obfuscated Unicode**:
   - Zero tolerance for Unicode bidirectional override characters (`\u202A`–`\u202E`, `\u2066`–`\u2069`), zero-width spaces/joiners (`\u200B`–`\u200D`, `\u2060`), and embedded byte-order marks (`\uFEFF`) in source files (CVE-2021-42576 / CVE-2021-42694).
2. **Malicious Shell & Exfiltration Payloads**:
   - Pipe-to-shell patterns (`curl | sh`, `wget | bash`).
   - Reverse shell execution (`/dev/tcp/`, `nc -e`, `socat`).
   - Dynamic evaluation of obfuscated base64/hex payloads (`eval(Buffer.from(...))`, `new Function(...)`).
3. **Unapproved Executable Binaries**:
   - Committing compiled binaries (`.exe`, `.so`, `.dylib`, `.dll`, ELF, Mach-O) or unvetted blobs is prohibited.
4. **CI/CD Workflow Tampering**:
   - Fork PRs modifying files in `.github/workflows/` or root deployment configs (`render.yaml`) are quarantined and require explicit review from `@mallison031`.
5. **Dependency Supply Chain**:
   - Lockfiles must be frozen (`cargo --locked`, `pnpm --frozen-lockfile`). No direct unvetted `git://` or `http://` package dependencies.

