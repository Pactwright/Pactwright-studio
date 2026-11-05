<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="brand/pactwright-logo-dark.svg">
    <img alt="Pactwright" src="brand/pactwright-logo-light.svg" width="460">
  </picture>
</p>

<p align="center">
  <b>Where every pact becomes visible and provable.</b><br>
  Public pact timelines, verifiable receipts, and dashboards for sellers and agent owners.
</p>

<p align="center">
  <a href="https://github.com/Pactwright/Pactwright-studio/actions/workflows/ci.yml"><img src="https://github.com/Pactwright/Pactwright-studio/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT license"></a>
  <a href="https://scorecard.dev/viewer/?uri=github.com/Pactwright/Pactwright-studio"><img src="https://api.scorecard.dev/projects/github.com/Pactwright/Pactwright-studio/badge" alt="OpenSSF Scorecard"></a>
</p>

<p align="center">
  <a href="https://pactwright-studio.vercel.app"><strong>Open Studio</strong></a> ·
  <a href="https://pactwright.github.io/docs/"><strong>Documentation</strong></a> ·
  <a href="#-quick-start"><strong>Quick start</strong></a> ·
  <a href="#-anchoring-and-dashboards"><strong>Anchoring</strong></a> ·
  <a href="https://github.com/Pactwright/Pactwright-studio/releases/download/v0.1.0-rc.1/brag.mp4"><strong>Watch Film (1080p)</strong></a>
</p>

<p align="center">
  <a href="https://github.com/Pactwright/Pactwright-studio/releases/download/v0.1.0-rc.1/brag.mp4">
    <img src="https://github.com/Pactwright/Pactwright-studio/releases/download/v0.1.0-rc.1/film-preview.webp" width="100%" alt="Pactwright Launch Film: one agent, four purchases, four endings, each enforced on Stellar testnet">
  </a>
</p>

> 🔊 **Turn sound on.** [Download or watch the full film (1080p, 60 fps, with music & sound)](https://github.com/Pactwright/Pactwright-studio/releases/download/v0.1.0-rc.1/brag.mp4)  
> *One agent, four purchases, four different endings on Stellar testnet: paid pro rata for 3 of 4 pages, refunded for a tortilla recipe, refunded when nobody answered, and half refunded after a dispute.*

> [!IMPORTANT]
> **Live on testnet: [pactwright-studio.vercel.app](https://pactwright-studio.vercel.app).** It indexes the
> `pact` contract, and anchors receipts on the deployed `ReceiptAnchor`. Syncs land hours apart, not every
> 5 minutes ([Deploy](#deploy)); every proof verifies on-chain with `verify_receipt`. Testnet only, not
> audited. The seller and agent-budget pages still show sample data. [What works today](#what-works-today) has the details.

## 📖 Overview

An escrow contract settles the money, but people still need to *see* what happened and to *prove* it later. Studio is the public face of a pact: it follows the contract on-chain, renders one page per purchase, and turns each final outcome into a receipt that anyone can check without trusting Studio, GitHub, or whoever happens to be hosting the page.

| Question | Without Studio | With Studio |
|---|---|---|
| "What happened to my purchase?" | Read raw contract events in an explorer | A timeline page per pact: opened, verdict, settled or released, with links to every transaction |
| "Can I prove I paid for this?" | Trust the seller's server | A certificate: a receipt plus a Merkle proof against a root anchored on Stellar |
| "Is the certificate real?" | Ask whoever issued it | Check the proof yourself, offline, or against `ReceiptAnchor.verify_receipt` on-chain |
| "How is my business doing?" | Spreadsheet the events | Merchant dashboard: revenue, refund and dispute rates, cost per route |
| "What are my agents spending?" | Track every wallet by hand | Principal view: budgets and live pacts per agent |

The interface keeps three objects that carry meaning: the Pactwright **seal**, which presses in when a certificate verifies; **stamps** for a pact's state (teal when the money moved as agreed, rose when it came back, indigo while it is in escrow); and the timeline as a **chain of blocks**, each labelled with its ledger. Amounts and events are in plain words ("1.00 USDC to the seller, 0.00 USDC back to the buyer"). It works without JavaScript for lookup, respects reduced motion, and has been audited at phone, tablet and desktop sizes, including at 200% text.

### 🏗️ Architecture

Five parts, and only one of them can move money (it cannot — the contract does):

1. **Indexer** — reads `pact` and `RefundVault` events from Stellar RPC on a schedule, keeps one cursor per source, and writes idempotently, so a re-run never double-counts. If the cursor falls behind RPC retention it backfills from an archival RPC or an HTTP history source, and raises an alert at 50% of the retention window.
2. **Receipt leaves** — when a pact reaches a final state (settled, released or refunded), its outcome is hashed into a leaf covering who paid whom, how much, and in which transaction. The leaf is byte for byte the contract's `receipt_leaf`, tested against its vectors, and every receipt keeps its leaf inputs so anyone can recompute it.
3. **Anchorer** — collects pending leaves into a sorted-pair SHA-256 Merkle tree in Accensa's `ReceiptAnchor` format, bounded by a maximum batch size and a minimum interval. Each batch is recorded as a plan before it is sent; the next run reconciles plans against the chain first, so a batch is never anchored twice or lost.
4. **Certificate** — the receipt plus the sibling hashes from leaf to root. Recompute the root offline and compare it with the anchored one; that is the whole proof, and it needs nothing from Studio.
5. **Web app** — a Next.js app over the same Postgres: public timeline, certificate viewer, merchant and principal dashboards, and an ops health route.

| Path | What |
|---|---|
| [`apps/web/app`](apps/web/app) | Next.js pages and API routes |
| [`apps/web/lib/indexer`](apps/web/lib/indexer) | Event sources, decoding, cursor, backfill |
| [`apps/web/lib/anchorer`](apps/web/lib/anchorer) | Reconcile → batch → anchor → proofs (core-team path) |
| [`apps/web/lib/verify.ts`](apps/web/lib/verify.ts) | Receipt leaves and offline proof verification |
| [`apps/web/lib/ops`](apps/web/lib/ops) | Monitoring signals |
| [`apps/web/components`](apps/web/components) | Timeline, certificate card, transaction links |
| [`apps/web/test`](apps/web/test) | Unit tests and Playwright specs |
| [`migrations`](migrations) | Schema, migration runner and seed data |
| [`templates/pollar-studio`](templates/pollar-studio) | Storefront template for Pollar Studio sellers |
| [`docs`](docs) | PRD, architecture, essentials, project structure |

## 📊 Anchoring and dashboards

How a receipt becomes provable, the trust model, and the anchoring and dashboard details are in [docs/OVERVIEW.md](docs/OVERVIEW.md).

### What works today

| Piece | Status | Notes |
|---|---|---|
| Postgres schema and migrations | ✅ Working | `001_core.sql` through `005_deferred_events.sql`. Each file is applied once; the runner records what it applied |
| Indexer: Stellar RPC `getEvents` | ✅ Testnet | `pact` events and RefundVault refunds, one cursor per source, one database transaction per event, idempotent |
| Out-of-order events | ✅ Working | A refund whose pact isn't indexed yet can't be written (`pact_events.pact_id` references `pacts`), so it is held in `deferred_events` and retried at the end of every pass — never dropped, and never a reason to stall the source's cursor |
| Receipt leaves | ✅ Working | Byte for byte as the contract's `receipt_leaf`, tested against its vectors. Each receipt keeps its leaf inputs so anyone can recompute it |
| Anchorer: `anchor_batch` | ✅ Testnet | Real transactions signed by the ReceiptAnchor admin key. Batch 1: 9 receipts, [`be51068e…`](https://stellar.expert/explorer/testnet/tx/be51068eea65b8f47799253ca45bd5e5d9c014d7cae0b873f19150658d8edfb0) |
| Crash safety | ✅ Working | Each batch is recorded as a plan before it's sent; the next run settles plans against the chain, so a batch is never anchored twice or lost |
| Certificates | ✅ Testnet | Every anchored proof verifies offline and with ReceiptAnchor's own `verify_receipt` |
| Lag alerting | ✅ Working | Alert past 11394 ledgers (~15.8 h) — twice the worst gap the scheduler actually delivers — capped at 50% of RPC retention. Field by field in [Ops health](#ops-health) |
| Backfill from a history source | ✅ Working | If the cursor falls outside RPC retention, `sync` backfills from an archival RPC (`HISTORY_RPC_URL`) or an HTTP history source; without one it stops with an error rather than skip events |
| M0 pacts | 🚧 Not yet | M0 pacts aren't opened on-chain, so Studio must learn of them from the facilitator — the third source `S-02` names and studio#50 is about adding. Until that source exists their refunds stay in `deferred_events`, counted and retried each pass, so nothing is lost when it arrives |
| Home page, pact timeline, certificate viewer | ✅ Testnet | Live; Playwright end-to-end tests. Checked at phone, tablet and desktop sizes |
| Merchant dashboard, principal view | 🧪 Seeded data | No sign-in yet |
| Ops health probes | ✅ Working | All five probes are measured from their own source: sponsor balance, indexer lag, RPC retention and the anchoring backlog, the verifier error rate, and the sampled post-anchor verification. What each field means, and what a 503 says, is in [Ops health](#ops-health) |
| Pollar Studio storefront template | ✅ Template | `templates/pollar-studio`, built with the public Pollar SDK only |
| Hosted deployment | ✅ Testnet | [pactwright-studio.vercel.app](https://pactwright-studio.vercel.app) on Vercel. The [`studio-cron`](.github/workflows/studio-cron.yml) workflow drives syncs and hourly anchoring; the syncs that actually arrive are measured at 8.3 a day, not every 5 minutes ([Deploy](#deploy)) |

## ⚙️ Supported Versions & Compatibility

Testnet only, pre-1.0. What "supported" means here is in [docs/OVERVIEW.md](docs/OVERVIEW.md#what-supported-means-here).

### Compatibility matrix

| Target | Status | Notes |
|---|---|---|
| **Node 24, pnpm 10.34.7** | **Supported** | The exact pair CI installs and tests with |
| **Older Node / pnpm** | **Untested** | `engines` requires Node ≥24; the lockfile is pnpm 10 |
| **Stellar testnet** | **Supported** | Live: indexing, anchoring, certificate verification |
| **Stellar pubnet** | **Not implemented** | Startup refuses the plaintext anchorer key on pubnet; `ANCHORER_SECRET_REF` (KMS) is not supported yet |

## 🚀 Quick Start

### 1. Installation

Requires Node.js 24, pnpm 10 and a PostgreSQL database.

```bash
git clone https://github.com/Pactwright/Pactwright-studio.git && cd Pactwright-studio
pnpm install
cp .env.example .env          # set DATABASE_URL, e.g. postgres://localhost:5432/pactwright
pnpm db:migrate               # creates the schema
pnpm db:seed                  # loads fixture pacts, receipts and accounts
```

### 2. Configuration

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Managed Postgres connection string |
| `STELLAR_NETWORK`, `STELLAR_NETWORK_PASSPHRASE`, `STELLAR_RPC_URL` | Network. Startup fails if these are incomplete or inconsistent |
| `HISTORY_RPC_URL` / `HISTORY_SOURCE_URL` | Backfill when the cursor falls outside RPC retention: an archival Stellar RPC, or an HTTP service returning base64-XDR events and `scannedThroughLedger` |
| `PACT_CONTRACT_ID`, `RECEIPT_ANCHOR_ID`, `FACILITATOR_URL` | What to index and where to anchor ([addresses](https://github.com/Pactwright/Pactwright-contracts/blob/main/DEPLOYMENTS.md)) |
| `INDEX_START_LEDGER`, `REFUND_VAULT_IDS` | First ledger to index; RefundVaults whose refunds are indexed |
| `ANCHORER_SECRET` | `ReceiptAnchor` admin key, testnet only (refused on pubnet) |
| `ANCHORER_SECRET_REF` | KMS reference to the anchorer key for pubnet (not supported yet) |
| `ANCHOR_MAX_BATCH_SIZE` | Maximum receipts to anchor per batch (default: 100, hard cap: 1000) |
| `ANCHOR_MIN_INTERVAL_SECONDS` | Minimum elapsed seconds between anchored batches (default: 0) |
| `VERIFIER_URL` | the verifier whose verdict counters feed the `verifier_error_rate` probe (`/api/ops/health`) |
| `SPONSOR_ACCOUNT` | address the low-balance probe watches, when the signing key is not in the environment (pubnet) |
| `CRON_SECRET` | Protects `/api/sync` and `/api/anchor` |
| `OPS_ALERT_WEBHOOK` | External webhook endpoint for delivering CRITICAL ops alerts (Slack/Discord/JSON) |
| `PROBE_MIN_SPONSOR_BALANCE_XLM` | Minimum XLM balance threshold for sponsor account (default: 10) |
| `PROBE_MAX_INDEXER_LAG_SECONDS` | Optional wall-clock lag threshold in seconds; when set it is checked in addition to the ledger threshold. Unset by default |
| `PROBE_MAX_INDEXER_LAG_LEDGERS` | Optional override for indexer lag ledger threshold |
| `PROBE_MAX_PENDING_CERTIFICATES` | Max pending unanchored certificates threshold (default: the larger of 500 and 2 × `ANCHOR_MAX_BATCH_SIZE`) |
| `PROBE_MAX_VERIFIER_ERROR_RATE` | Max verifier error rate fraction threshold (default: 0.05) |

### 3. Usage

```bash
pnpm dev                      # http://localhost:3000
```

The routes the app serves, described for programs in [`docs/openapi.yaml`](docs/openapi.yaml):

| Route | Kind | Purpose |
|---|---|---|
| `/` | Page | Pact lookup and the latest pacts |
| `/pact/[id]` | Page | Public pact timeline (`/pact?id=…` redirects here, so lookup works without JavaScript) |
| `/verify` | Page | Certificate viewer: offline proof plus on-chain status |
| `/merchant` | Page | Seller dashboard |
| `/principal` | Page | Agent owner view |
| `GET /api/pacts/:id` | API | A pact and its events |
| `GET /api/certificates/:id` | API | A certificate: `pending` until anchored, then `anchored` with its proof |
| `GET /api/sync` | Cron | One indexer cycle (requires `CRON_SECRET`) |
| `GET /api/anchor` | Cron | One anchoring cycle (requires `CRON_SECRET`) |
| `GET /api/ops/health` | Ops | Health and monitoring signals, field by field in [Ops health](#ops-health) |
| `GET /api/ops/liveness` | Ops | Liveness probe for deployment health checks |

The data behind those pages:

| Table | Holds |
|---|---|
| `pacts` | One row per pact: parties, cap, state, amounts, deadlines |
| `pact_events` | Every on-chain event, keyed so a re-index is idempotent |
| `verdicts` | Verifier envelopes and attestations per pact and milestone |
| `receipts` | One leaf per final outcome, with its batch and proof once anchored |
| `receipt_batches` | Each anchored Merkle root and its transaction |
| `sync_state` | The indexer's cursor per source |
| `sellers`, `routes`, `agents`, `budgets` | Accounts for the dashboards (v1) |

Tests:

```bash
pnpm typecheck
pnpm test                     # 62 unit tests
pnpm --filter web e2e         # 3 Playwright end-to-end tests
```

### Deploy

Testnet is live at [pactwright-studio.vercel.app](https://pactwright-studio.vercel.app), hosted on Vercel (project `pactwright-studio`, root directory `apps/web`). [`apps/web/vercel.json`](apps/web/vercel.json) runs the migrations before every build. Vercel's Hobby plan only runs crons daily, so the [`studio-cron`](.github/workflows/studio-cron.yml) GitHub Actions workflow asks for `/api/sync` every 5 minutes and `/api/anchor` every hour. What arrives is not what it asks for, and the workflow is not the reason: measured 2026-11-05 over the 56 `schedule` runs of the previous 6.74 days, **8.3 runs a day** against the 312/day those two cron entries imply (2.66% of them), with gaps of median 3.02 h, p90 5.67 h and a worst 7.91 h. 51 of the 56 were created off a scheduled minute yet started within a second of being created, so the ticks reach Actions late rather than queueing behind a busy runner; none was cancelled, none failed, and each took 18 s at the median, 79 s at worst. Sync and anchor now hold separate concurrency locks, so a slow anchor cannot sit on the lock a sync tick needs -- the other scheduled workflow in this repo, `synthetic-keepalive.yml` asking for `*/10 * * * *`, arrives at 4.1 runs/day with a different lock and `cancel-in-progress: true`, which is what says the shortfall is the account's schedule delivery and not either file's configuration, and the indexer-lag alert in [`apps/web/lib/ops/monitoring.ts`](apps/web/lib/ops/monitoring.ts) is derived from the gap that actually runs rather than the 5 minutes the file asks for. It needs the repository secrets `STUDIO_URL` and `CRON_SECRET` (the same value as on Vercel), and fails loudly without them.

1. `vercel link` from the repository root, choosing `apps/web` as the root directory, then `vercel deploy --prod`.
2. Set the Production environment variables (`vercel env add <NAME> production`): `DATABASE_URL`, `ANCHORER_SECRET` (the `ReceiptAnchor` admin key, testnet only), `RECEIPT_ANCHOR_ID`, `PACT_CONTRACT_ID`, `INDEX_START_LEDGER`, `REFUND_VAULT_IDS`, `STELLAR_NETWORK`, `NEXT_PUBLIC_STELLAR_NETWORK`, `STELLAR_NETWORK_PASSPHRASE`, `STELLAR_RPC_URL`, `VERIFIER_URL`, `FACILITATOR_URL`, and `CRON_SECRET` (also set as a repository secret for the `studio-cron` workflow).
3. Check `/api/ops/health`: it reports every XC-03 signal — sponsor balance, indexer lag (must stay
   under 11394 ledgers, about 15.8 h: twice the worst measured sync gap, capped at 50% of RPC retention),
   pending certificates and the verifier error rate. A signal it cannot measure is listed as an alert,
   never as a pass, so an unreadable verifier or a missing `VERIFIER_URL` shows up as a 503, not an all-clear.

Scheduling lives in one place: `.github/workflows/studio-cron.yml` calls `/api/sync` and `/api/anchor` with the `CRON_SECRET` bearer token. `apps/web/vercel.json` deliberately has no `crons`, so there is no second, silently-dead set of schedules next to the real ones.

```bash
DATABASE_URL="<hosted-postgres-url>" pnpm db:migrate
```

### Ops health

`GET /api/ops/health` answers `200` when every probe cleared its threshold and `503` when any did not, so a monitor can act on the status code alone. The body has four fields:

| Field | Contents |
|---|---|
| `healthy` | `true` only when `alerts` is empty. |
| `probes` | One entry per signal in the table below, plus one entry for each signal whose source could not be read. |
| `alerts` | The `alert` text of every failing probe, in probe order. |
| `metrics` | The raw readings the thresholds were applied to, keyed by signal. |

Each probe in `probes` carries:

| Probe field | Meaning |
|---|---|
| `name` | Which signal this is — the five names in the table below. |
| `ok` | Whether the reading cleared its threshold. |
| `value` | The reading, in the unit below. **Absent when the signal could not be read** — a probe reports no number it did not measure. |
| `threshold` | The number `value` was compared against, after any override. |
| `configSource` | Where that threshold came from: `default:…`, `env:<VAR>`, `derived:…`, `explicit:argument`, `on-chain:…`, or `unmeasured`. |
| `alert` | The message the probe contributes to `alerts` when it fails; absent when it passes. |
| `unhealthySince` | On a failing probe: when this run of failures began, from the probe history. |
| `alertCount` | On a failing probe: how many runs this streak holds. The alert webhook is delivered when it is 1, so a signal that stays broken is not re-notified every tick. |

The five signals, each with the unit its `value` is in, the threshold it uses when nothing overrides it, and the variable that overrides it:

| Probe | `value` is | Default threshold | Fails when | Override |
|---|---|---|---|---|
| `sponsor_balance` | XLM the account that pays ledger fees holds | 10 | below it | `PROBE_MIN_SPONSOR_BALANCE_XLM` |
| `indexer_lag` | ledgers between the RPC's latest ledger and the slowest source's cursor | the smaller of 11394 (~15.8 h at the measured 5 s/ledger: twice the worst sync gap `studio-cron` actually delivers) and 50% of RPC retention — so 8640 (~12 h) on the ~24 h window the backfill default assumes | at or above it | `PROBE_MAX_INDEXER_LAG_LEDGERS` (ledgers); `PROBE_MAX_INDEXER_LAG_SECONDS` adds a separate wall-clock ceiling and is checked only when set |
| `pending_certificates` | receipts with no `batch_id` yet | the larger of 500 and 2 × `ANCHOR_MAX_BATCH_SIZE` (default batch 100, so 500) | above it | `PROBE_MAX_PENDING_CERTIFICATES` |
| `verifier_error_rate` | fraction of the verifier's verdict requests that errored since it started (0–1) | 0.05 | above it; a verifier that has served zero requests passes at 0 rather than dividing by zero | `PROBE_MAX_VERIFIER_ERROR_RATE` |
| `anchor_verification` | 1 when the last sampled post-anchor check passed, 0 when one failed | 1 (the on-chain `ReceiptAnchor.verify_receipt` verdict) | a failure is on record | none — the threshold is the chain's answer, not a tunable |

`metrics` reports the raw readings those thresholds were applied to: `sponsorBalanceXlm`, `indexerLagLedgers`, `rpcRetentionLedgers`, `indexerLagSeconds`, `pendingCertificatesCount`, `verifierTotalRequests`, `verifierErrorRequests`. A signal whose source could not be read contributes no key at all, so `metrics` can be shorter than the probe list.

**The 503 rule: a probe that cannot be measured is an alert, never a pass.** Every signal comes from its own source — the RPC's `getHealth` for lag and retention, `count(*) FROM receipts WHERE batch_id IS NULL` for the backlog, the sponsor account's own ledger entry for its balance, `GET <VERIFIER_URL>/health` for the verifier's counters, and the anchorer's post-anchor `ReceiptAnchor.verify_receipt` call for the sampled check. When one of those is unreachable, `evaluateSystemHealth` does not drop the signal and answer 200 with what it did get; it adds a probe with `ok: false`, `configSource: "unmeasured"`, no `value`, and an alert that names the reason it failed (`CRITICAL: verifier_error_rate could not be measured (VERIFIER_URL is not set); its threshold was not checked.`), which makes the whole report unhealthy and the response 503. A deployment that cannot be configured at all — where nothing at all could be measured — answers 503 with `probes: []` and one CRITICAL alert rather than an empty all-clear. `anchor_verification` is the exception worth knowing: it is only listed when a post-anchor failure has actually been recorded, so a healthy deployment reports four probes, not five.

## 📊 Testnet pacts

Every MVP scenario ran as real testnet transactions on 2026-10-29 ([Pactwright-Kit testnet e2e](https://github.com/Pactwright/Pactwright-Kit/tree/main/e2e/testnet)). The escrow (M2) pacts are on the `pact` contract, so Studio indexes them; exact-refund (M0) purchases are direct payments, not on-chain pacts, so they don't appear yet.

| Scenario | Outcome | Transactions |
|---|---|---|
| M0 ALLOW | ALLOW, seller keeps 1 | [`e1105f24…`](https://stellar.expert/explorer/testnet/tx/e1105f24d40640eb66a73968c06ae4eedc9f860097a086b0f4450c25995c6600) |
| M0 DENY | DENY, 1 refunded | [`ae9975c0…`](https://stellar.expert/explorer/testnet/tx/ae9975c028fe6d6bb2159cf4b532cebf42dc6ff8de095adedbac29b52542b8a3) · [`2b78feb8…`](https://stellar.expert/explorer/testnet/tx/2b78feb8459b4731aa50bae1a290e3fd84a9a2b4956f5c6d2b7ae4f615bfae59) |
| M0 non-delivery | DENY, 0.5 refunded | [`df8af0bd…`](https://stellar.expert/explorer/testnet/tx/df8af0bd9c8f4be9477589d9991ab063134b0e9f92094a90218f5edc9a629005) · [`01357475…`](https://stellar.expert/explorer/testnet/tx/013574756ece7ae81643893f00fb14a2b220d54d096d936ea083a45129189b00) |
| M2 ALLOW | ALLOW 0.75 of 1, settled | [`0b08b71e…`](https://stellar.expert/explorer/testnet/tx/0b08b71e164252de154d6500b3b8c23c0d68f6a8a1710b87b86e79bbe1166f6c) · [`84a6549a…`](https://stellar.expert/explorer/testnet/tx/84a6549aaa6b61b0e8040d1b43f2819914dc0e40f52d85be871f455d0d5a3e71) · [`9fda6bea…`](https://stellar.expert/explorer/testnet/tx/9fda6beadb02f863f74e220820642a4509f269c31e3462fccf6318e1e2fa11c5) |
| M2 DENY | DENY, full refund | [`b953ee00…`](https://stellar.expert/explorer/testnet/tx/b953ee00524d5b0a9b53308ab1e370a2008fb82b7f5a949ac1934d2aa12d17a7) · [`324f630d…`](https://stellar.expert/explorer/testnet/tx/324f630d39eb88fa76a60b92617e5867421e9819c290a8f3d71ec4bd8bec9138) · [`272703bf…`](https://stellar.expert/explorer/testnet/tx/272703bfbe0a74becf50a80b5d16600396a17440a82c9b3af5c481d4748c22cf) |
| M2 silence | no verdict, refunded by silence policy | [`76df8318…`](https://stellar.expert/explorer/testnet/tx/76df83188eb7cf22c0b6c639fc0a090615ca3040ecfb6a3e43d6347cece27d59) · [`e62aff4d…`](https://stellar.expert/explorer/testnet/tx/e62aff4d291eff2b76ba282aae987d82c6ca91e1681e7944d96abb1f3739f833) |
| Dispute refund | dispute-1: 2 of 4 pages, 0.5 refunded | [`a191a000…`](https://stellar.expert/explorer/testnet/tx/a191a000f7920f2fff9839bbccceeeca35c82fce29a5e46510fd3db1bcdf2ff0) |

What is next, from [`ROADMAP.md`](ROADMAP.md): real data for the seller and agent-budget pages (registration and sign-in), indexing exact-refund purchases, and holding the anchorer key in a KMS before any mainnet deployment.

## 🤝 Community & Maintainers

Join the discussion and get support:

- **Discord**: [discord.gg/4WFU6fwPe](https://discord.gg/4WFU6fwPe)
- **Telegram**: [t.me/Pactwright](https://t.me/Pactwright)
- Documentation hub: [pactwright.github.io/docs](https://pactwright.github.io/docs/)
- The other repositories: [Contracts](https://github.com/Pactwright/Pactwright-contracts) · [Kit](https://github.com/Pactwright/Pactwright-Kit)
- Security reports: see [`SECURITY.md`](SECURITY.md) — privately, never a public issue.

| Maintainer | Role | Scope |
|---|---|---|
| Allison ([@mallison031](https://github.com/mallison031)) | Lead maintainer; reach out on [Telegram](https://t.me/Pactwright) or [Discord](https://discord.gg/4WFU6fwPe) | Everything |
| Pactwright core team | Core review | Indexer, anchorer, web app and schema |

## 🛠️ Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md). Every pull request updates [ROADMAP.md](ROADMAP.md): task status, progress counts and one Update log line — a pull request that does not touch it fails `roadmap-check`. `main` is protected, so pull requests need a review and green checks. The anchorer and the migrations are core-team paths (see `CODEOWNERS`).

### 🧑‍💻 Contributors

<img src="https://contrib.rocks/image?repo=Pactwright/Pactwright-studio" alt="Contributors to Pactwright-studio">

## License

Pactwright-studio is released under the **[MIT License](LICENSE)**.

```text
Copyright (c) 2026 Pactwright contributors
```
