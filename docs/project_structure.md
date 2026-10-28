# Pactwright — Project Structure (v0.2)

| | |
|---|---|
| Status | Draft v0.2 — 2026-10-28 (matches ARCHITECTURE v0.2) |
| Companion docs | [`PRD.md`](PRD.md) · [`ARCHITECTURE.md`](ARCHITECTURE.md) · [`ARCHITECTURE_ESSENTIALS.md`](ARCHITECTURE_ESSENTIALS.md) · [`ROADMAP.md`](ROADMAP.md) |
| Process | **Every contribution updates `ROADMAP.md`** ([`AGENTS.md`](AGENTS.md) §1); enforced by the `roadmap-check` workflow in every repo |

> `(P1)` / `(P2)` mark folders that stay empty until that release. Everything unmarked is MVP.

---

## 1. Workspace

```
pactwright/                       plain folder, not a repo
├── PRD.md
├── ARCHITECTURE.md
├── ARCHITECTURE_ESSENTIALS.md
├── project_structure.md          ← this file
├── ROADMAP.md                    master roadmap: every task, progress, update log
├── AGENTS.md                     instructions for agents + contributors (roadmap rule §1)
├── pactwright-contracts/         git repo · Rust / Soroban
├── pactwright-kit/               git repo · TypeScript (pnpm workspace)
└── pactwright-studio/            git repo · Next.js + Postgres
```

Outside the workspace, the `pact` x402 scheme and `/pact/submit` are contributed to
**`accensa/x402-facilitator-stellar`** (an already-approved Drips repo), in a new module
whose exact path follows that repo's layout (e.g. `src/pact/`).

## 2. Dependencies between repos

```
pactwright-contracts ── release assets: pact.wasm + hash, TS bindings, test-vectors ──▶ pactwright-kit
pactwright-contracts ── deployments/<network>.env ──▶ kit, studio, facilitator config
pactwright-kit       ── npm: @pactwright/core, /contracts-client, /agent, /seller, /mcp ──▶ pactwright-studio
pactwright-kit/core  ── npm ──▶ facilitator pact scheme (hashing + 402 schema)
```

- **`pactwright-contracts` is the source of truth for hashing** (ADR-015).
- CI never imports another repo by relative path, only published artifacts.
- Every consumer pins versions; a contracts release is adopted by an explicit bump.

---

## 3. `pactwright-contracts`

```
pactwright-contracts/
├── Cargo.toml                    workspace; soroban-sdk 28.x pinned
├── Cargo.lock
├── rust-toolchain.toml
├── budget.toml                   Tollcraft: cost-lint + budget-report baselines (× 1.15)
├── clippy.toml · deny.toml · rustfmt.toml
├── contracts/
│   ├── pact/
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs            entrypoints only; delegates to modules
│   │       ├── types.rs          Pact, PactState, Verdict, Silence, MeterTerms,
│   │       │                     VerdictAttestation, UsageVoucher, Config
│   │       ├── storage.rs        DataKey, TTL helpers (open extends past settle_deadline + GRACE)
│   │       ├── lifecycle.rs      open, settle, release; deadline + silence rules
│   │       ├── verdict.rs        record_verdict; attestation encoding; ed25519 verify
│   │       ├── meter.rs          close_meter; usage voucher encoding; ed25519 verify
│   │       ├── admin.rs          set_verifier (new pacts only)
│   │       ├── hashing.rs        pact_id, domain prefixes, receipt leaf
│   │       ├── events.rs         ("pact", <name>) events
│   │       ├── errors.rs         #[contracterror] Error
│   │       └── test/
│   │           ├── lifecycle.rs  every entrypoint × every error
│   │           ├── deadlines.rs  fake clock: silence refund/pay, settle/release boundaries
│   │           ├── invariants.rs one named test per invariant (ARCHITECTURE §4.5)
│   │           ├── budget.rs     #[budget_cpu_lt] / _mem_ / _read_bytes_ / _write_bytes_
│   │           ├── vectors.rs    reads ../../../test-vectors/*.json
│   │           └── integration.rs  pact + pinned RefundVault / ReceiptAnchor WASMs
│   └── testutils/                token setup, ledger helpers, key fixtures
├── vendor/
│   └── wasm/
│       ├── refund_vault.wasm
│       ├── receipt_anchor.wasm
│       └── SHA256SUMS            checked in CI (ADR-008)
├── test-vectors/                 source of truth for every hash (ADR-015)
│   ├── nonce.json · pact_id.json · condition_hash.json
│   ├── verdict_attestation.json · usage_voucher.json · delivery_receipt.json
│   ├── receipt_leaf.json · merkle.json
│   └── README.md                 format + regeneration command
├── fuzz/                         bolero: attestation/voucher decoding, amounts, deadlines
├── deployments/
│   ├── testnet.env               contract IDs + WASM hashes
│   └── pubnet.env                (after audit)
├── scripts/
│   ├── build.sh                  build + optimize
│   ├── deploy.sh                 refuses placeholder pubnet config
│   ├── bindings.sh               TS bindings → release asset
│   └── check_vendor_hashes.sh
├── docs/
│   ├── PRD.md · ARCHITECTURE.md · ARCHITECTURE_ESSENTIALS.md · project_structure.md
│   ├── EVENTS.md · INVARIANTS.md · BENCHMARKS.md · SECURITY_MODEL.md
│   └── adr/                      ADR-001 … ADR-015, one file each
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                fmt, clippy, test, deny
│   │   ├── cost-lint.yml         Tollcraft cost-linter Action, every PR
│   │   ├── budget-report.yml     cargo budget-report --check, post-merge on testnet
│   │   ├── vendor-hashes.yml
│   │   ├── release.yml           pact.wasm + hash, TS bindings, test-vectors
│   │   └── roadmap-check.yml     fails any PR that doesn't modify ROADMAP.md
│   ├── ISSUE_TEMPLATE/ · pull_request_template.md · dependabot.yml
│   └── CODEOWNERS                core team: lifecycle.rs, verdict.rs, meter.rs, hashing.rs
├── ROADMAP.md                    this repo's phases + update log (updated in every PR)
├── AGENTS.md                     same rules as the workspace copy
├── DEPLOYMENTS.md · CHANGELOG.md · CONTRIBUTING.md (roadmap rule) · SECURITY.md
├── NOTICE                        Accensa, Tollcraft, Witness, Vespi, BookerBob, Ficha, Pollar
├── LICENSE                       MIT
└── README.md
```

## 4. `pactwright-kit`

```
pactwright-kit/
├── package.json                  engines.node ">=24"
├── pnpm-workspace.yaml · tsconfig.base.json · tsconfig.json · vitest.config.ts
├── eslint.config.mjs · .prettierrc.json · .nvmrc
├── .env.example                  every variable, commented
├── packages/
│   ├── core/                     @pactwright/core
│   │   ├── src/
│   │   │   ├── schemas.ts        Mode, PactState, Transition, PactwrightExtra (v2), Certificate
│   │   │   ├── hashing.ts        nonce, pactId, conditionHash, attestation/usage/delivery msgs, leaf
│   │   │   ├── merkle.ts         sorted-pair SHA-256
│   │   │   ├── amounts.ts        decimal ⇄ stroops (the only conversion point)
│   │   │   ├── network.ts        fails if passphrase / RPC config is incomplete
│   │   │   └── index.ts
│   │   └── test/vectors.test.ts  runs the pinned contracts release's test-vectors
│   ├── contracts-client/         @pactwright/contracts-client — generated bindings, never hand-edited
│   ├── agent/                    @pactwright/agent
│   │   └── src/
│   │       ├── client.ts         createPactwright()
│   │       ├── buy.ts            402 → exact pay (M0) or pact open (M2) → body + delivery receipt
│   │       ├── await.ts          evidence → verdict → terminal state
│   │       ├── idempotency.ts    idempotency key → nonce
│   │       ├── meter-loop.ts     (P1) signs cumulative usage vouchers, never beyond cap
│   │       ├── certificate.ts    pending | anchored
│   │       └── accounts.ts       agent create (sponsored reserves + trustline), top-up
│   ├── seller/                   @pactwright/seller
│   │   └── src/
│   │       ├── pact.ts           route options → behavior
│   │       ├── express.ts
│   │       ├── hono.ts           (P1)
│   │       ├── payment-required.ts   402 with extra.pactwright
│   │       ├── delivery.ts       signs X-Pactwright-Delivery; refuses terminal pacts
│   │       ├── startup-checks.ts USDC trustline, network config
│   │       ├── hooks/settle.ts   @accensa/sdk createSettleHook(); M2 auto-settle on ALLOW
│   │       ├── hooks/refund.ts   M0 RefundVault.refund on DENY / partial
│   │       ├── hooks/meter.ts    (P1) keeps latest voucher, calls close_meter
│   │       └── hooks/proof-of-purchase.ts  (P2) batched, delayed BookerBob add_member
│   ├── mcp/                      @pactwright/mcp
│   │   └── src/tools/            find-sellers, buy, get-pact, dispute, get-certificate
│   ├── adapters/                 @pactwright/adapters
│   │   └── src/
│   │       ├── types.ts          Discovery, Reputation, Gate, Wallet, Verifier
│   │       ├── discovery-bazaar/
│   │       ├── reputation-identity/      MVP: no re-ranking
│   │       ├── reputation-bookerbob/     (P2)
│   │       ├── gate-manual/              MVP: CLI budget funding
│   │       ├── gate-vespi/               (P1)
│   │       ├── wallet-keypair/
│   │       ├── wallet-pollar/            (P1) principal funding
│   │       └── verifier-witness/
│   └── cli/                      @pactwright/cli
│       └── src/commands/         verify, pact, agent-create, agent-topup
├── services/
│   └── verifier/
│       ├── src/
│       │   ├── server.ts         Hono: /v1/verdicts, /v1/envelopes/:sha256, /health
│       │   ├── pipeline.ts       delivery receipt → evidence hash → model → rules → sign
│       │   ├── rules/            one deterministic rule set per condition kind
│       │   │   └── document-translation.ts   MVP's only kind
│       │   ├── models/           types.ts, llm.ts (provider-neutral; provider + model pinned in config, structured output)
│       │   ├── sign.ts           envelope + one attestation per pact (M2)
│       │   ├── submit.ts         facilitator /pact/submit (record_verdict, release)
│       │   ├── non-delivery.ts   seller webhook challenge → DENY on timeout
│       │   ├── store.ts          unique (pact_id, milestone)
│       │   └── privacy.ts        (P1) retention, redaction
│       ├── eval/                 labelled cases + accuracy script
│       └── Dockerfile
├── vendor/witness-core/          vendored @witness/core (Apache-2.0) + NOTICE
├── examples/
│   ├── seller-express/
│   ├── agent-node/
│   └── metered-minutes/          (P1) Ficha-style pay-per-minute demo
├── docs/
├── .github/workflows/
│   ├── ci.yml                    lint, typecheck, vitest
│   ├── vectors.yml               core vs. pinned contracts test-vectors
│   ├── e2e-testnet.yml           nightly: every scenario in ARCHITECTURE §13
│   ├── verifier-eval.yml         fails below the accuracy threshold
│   ├── release.yml               changesets → npm
│   └── roadmap-check.yml         fails any PR that doesn't modify ROADMAP.md
├── .github/ISSUE_TEMPLATE/ · pull_request_template.md · CODEOWNERS · dependabot.yml
├── .changeset/
├── ROADMAP.md · AGENTS.md
├── CHANGELOG.md · CONTRIBUTING.md (roadmap rule) · SECURITY.md · NOTICE · LICENSE (Apache-2.0) · README.md
```

## 5. `pactwright-studio`

```
pactwright-studio/
├── package.json · pnpm-workspace.yaml · tsconfig.json · .env.example · .nvmrc
├── apps/web/
│   ├── app/
│   │   ├── page.tsx                      landing
│   │   ├── pact/[id]/page.tsx            public pact timeline
│   │   ├── verify/page.tsx               certificate viewer
│   │   ├── (merchant)/                   (P1)
│   │   ├── (principal)/                  (P1)
│   │   └── api/
│   │       ├── pacts/[id]/route.ts
│   │       ├── certificates/[id]/route.ts
│   │       ├── sync/route.ts             indexer (cron)
│   │       └── anchor/route.ts           anchorer (cron)
│   ├── components/                       Timeline, CertificateCard, TxLink, StateBadge
│   ├── lib/
│   │   ├── db.ts
│   │   ├── indexer/                      getEvents, cursor, backfill, lag alert
│   │   ├── anchorer/                     reconcile → batch → anchor_batch → proofs
│   │   └── explorer.ts                   Stellar Expert links per network
│   └── test/                             Vitest + Playwright
├── migrations/
│   ├── 001_core.sql                      pacts, pact_events, verdicts, receipt_batches, receipts, sync_state
│   └── 002_accounts.sql                  (P1) sellers, routes, agents, budgets
├── templates/pollar-studio/              (P2) SDK only, no Pollar Studio code
├── docs/
├── .github/workflows/                    ci.yml, e2e.yml, migrations.yml, roadmap-check.yml
├── ROADMAP.md · AGENTS.md
├── CHANGELOG.md · CONTRIBUTING.md (roadmap rule) · SECURITY.md · NOTICE · LICENSE (MIT) · README.md
```

## 6. Conventions

| Topic | Rule |
|---|---|
| Names | Crates `pactwright-*` · npm `@pactwright/*` · events `("pact", <name>)` |
| Amounts | `i128` stroops on-chain · decimal strings in TS, converted only in `core/amounts.ts` · `numeric(30,7)` in SQL |
| Hashing | Only `contracts/pact/src/hashing.rs` and `packages/core/src/hashing.ts`; both tested against `test-vectors/` |
| Config | Every variable in `.env.example`; startup fails on incomplete network config |
| Secrets | Never in repos; seller and verifier keys from KMS in deployments |
| Tests | Next to code; one named test per invariant; fake clock for deadlines |
| Docs | Shared docs copied into each repo's `docs/` on release; ADRs in `docs/adr/` |
| Roadmap | **Every PR updates its repo's `ROADMAP.md`** (task status, counts, Update log line); task IDs are global; maintainers sync the master weekly; `roadmap-check` enforces it |
| Commits | Conventional commits |
| Licenses | contracts MIT · kit Apache-2.0 (vendors Witness) · studio MIT · `NOTICE` everywhere |

## 7. Drips Wave readiness

| Item | Rule |
|---|---|
| Labels | `Stellar Wave`, `complexity: trivial|medium|high`, `area: contracts|kit|verifier|studio|docs|ci`, `good first issue`, `core-team-only` |
| Core-team-only | `lifecycle.rs`, `verdict.rs`, `meter.rs`, `hashing.rs`, `services/verifier/src/sign.ts`, the facilitator `pact` scheme's validation code — never labelled `Stellar Wave` |
| Issue template | Context · acceptance criteria · files involved · out of scope · **roadmap task ID** |
| PR template | Checklist starts with "`ROADMAP.md` updated (status, counts, Update log)" |
| Before applying | Green CI, testnet transactions (M0 ALLOW/DENY, M2 ALLOW/DENY) linked in each README |
| Applications | 3 Pactwright repos; facilitator work lands as issues in the already-approved Accensa repo |

## 8. Bootstrapping order

0. **all repos:** `ROADMAP.md`, `AGENTS.md`, CONTRIBUTING with the roadmap rule, `roadmap-check` workflow (ROADMAP F-03, F-05).
1. **contracts:** `pact` with open / record_verdict / settle / release, deadlines, invariants, budget tests, `test-vectors/`, CI with both Tollcraft gates.
2. **facilitator:** `pact` scheme `/verify` + `/settle`, then `/pact/submit`.
3. **kit:** `core` against the vectors → `contracts-client` → `seller` (Express) + `agent` for M0, then M2 → MCP.
4. **verifier:** `document.translation` rules, eval set, non-delivery flow.
5. **studio:** `001_core.sql`, indexer with backfill, anchorer, pact page, certificate viewer.
6. **Testnet:** M0 ALLOW/DENY and M2 ALLOW/DENY/silence transactions linked in all READMEs → apply to Drips Wave.
7. **v1:** metering + `metered-minutes` example, disputes, Hono, Vespi/Pollar add-ons, dashboards.

## 9. Scaffold additions (2026-10-28)

The scaffold follows §3–5 and adds these files, which belong to the structure from now on:

| Repo | Added | Why |
|---|---|---|
| contracts | `scripts/gen_vectors.sh` | Regenerates `test-vectors/` (C-03) |
| contracts | `types.rs`: `OpenParams`, `Metering { None, Units(MeterTerms) }` | `open` takes one struct; `Option<MeterTerms>` can't be converted inside a `#[contracttype]` struct |
| kit | root `tsconfig.json`, `vitest.config.ts` (replaces `vitest.workspace.ts`) | Single typecheck program; current Vitest config format |
| kit | `core/src/errors.ts` (`notImplemented(task)`) | Every stub throws with its ROADMAP task ID |
| kit | `core/test/schemas.test.ts` | Data-model tests from day one |
| kit | `agent/src/find.ts`, `mcp/src/tool.ts`, `mcp/src/server.ts` | Split responsibilities; MCP SDK wired in K-11 |
| kit | `services/verifier/src/{config,types}.ts`, `rules/types.ts`, `models/{types,llm}.ts` | Verifier config, Witness envelope mirror (until K-14), rule-set and model-adapter contracts |
| studio | `apps/web/lib/types.ts` | Row types matching `001_core.sql` |
| studio | `apps/web/app/api/_lib/not-implemented.ts` | Scaffold routes answer 501 with their ROADMAP task |
| studio | `lib/indexer/{index,cursor,sources,backfill}.ts`, `lib/anchorer/{index,reconcile,batch}.ts` | Indexer and anchorer split by responsibility |
| studio | `playwright.config.ts`, `next.config.ts` | Tooling |

Packages are consumed from source during development (`exports` → `src/index.ts`, Node 24 type
stripping, `.ts` import extensions). A build step for npm publishing is decided in K-01/K-17.
