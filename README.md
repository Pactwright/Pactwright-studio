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
  <a href="https://github.com/Pactwright/Pactwright-studio/actions/workflows/ci.yml"><img src="https://img.shields.io/badge/tests-48_unit_%2B_e2e-2DD4BF?style=for-the-badge&labelColor=0B1220" alt="48 unit tests plus end-to-end tests"></a>
  <a href="#what-works-today"><img src="https://img.shields.io/badge/anchoring-testnet-2DD4BF?style=for-the-badge&labelColor=0B1220" alt="Anchoring on testnet"></a>
  <a href="#what-works-today"><img src="https://img.shields.io/badge/deployment-not_yet-F59E0B?style=for-the-badge&labelColor=0B1220" alt="Not deployed yet"></a>
  <a href="https://github.com/Pactwright/Pactwright-contracts"><img src="https://img.shields.io/badge/contract-testnet-6366F1?style=for-the-badge&labelColor=0B1220" alt="Contract on testnet"></a>
  <a href="#license"><img src="https://img.shields.io/badge/license-MIT-94A3B8?style=for-the-badge&labelColor=0B1220" alt="MIT license"></a>
</p>

<p align="center">
  <a href="#in-60-seconds"><b>In 60 seconds</b></a> ·
  <a href="#how-a-receipt-becomes-provable"><b>How a receipt becomes provable</b></a> ·
  <a href="#what-works-today"><b>What works today</b></a> ·
  <a href="#run-it-locally"><b>Run it locally</b></a> ·
  <a href="#license"><b>License</b></a> ·
  <a href="https://github.com/Pactwright/Pactwright-contracts">Contracts</a> ·
  <a href="https://github.com/Pactwright/Pactwright-Kit">Kit</a>
</p>

<p align="center">
  <a href="https://scorecard.dev/viewer/?uri=github.com/Pactwright/Pactwright-studio"><img src="https://api.scorecard.dev/projects/github.com/Pactwright/Pactwright-studio/badge" alt="OpenSSF Scorecard"></a>
</p>

> [!IMPORTANT]
> **Not deployed yet.** The indexer reads real `pact` and RefundVault events from Stellar testnet,
> and the anchorer has anchored real receipts on the deployed ReceiptAnchor. Every proof verified
> on-chain with `verify_receipt` ([batch 1](https://stellar.expert/explorer/testnet/tx/be51068eea65b8f47799253ca45bd5e5d9c014d7cae0b873f19150658d8edfb0)).
> There is no public URL yet. [What works today](#what-works-today) has the details.

## Contents

1. [In 60 seconds](#in-60-seconds)
2. [Why this exists](#why-this-exists)
3. [Who uses it](#who-uses-it)
4. [How a receipt becomes provable](#how-a-receipt-becomes-provable)
5. [What works today](#what-works-today)
6. [Pages and API](#pages-and-api)
7. [Run it locally](#run-it-locally)
8. [Deploy](#deploy)
9. [Data model](#data-model)
10. [Layout](#layout)
11. [Testnet pacts to index](#testnet-pacts-to-index)
12. [Project status](#project-status)
13. [FAQ](#faq)
14. [Built on](#built-on)
15. [Contributing](#contributing)
16. [License](#license)

## In 60 seconds

- **What a pact is.** An AI agent's purchase held in escrow on Stellar. The buyer's money moves only when a verifier confirms delivery; otherwise it goes back. The [contract](https://github.com/Pactwright/Pactwright-contracts) runs on testnet.
- **What Studio does.** It follows every pact on-chain and shows its timeline. It turns each final outcome into a receipt and anchors batches of receipts on Stellar. The result is a certificate anyone can check, with or without trusting Studio.
- **What runs today.** A Next.js app with the pact timeline, the certificate viewer, merchant and principal dashboards, the indexer and anchorer logic, ops health checks and a Postgres schema. It has 48 unit tests and Playwright end-to-end tests in CI, plus a live testnet test that indexes, anchors and verifies real receipts.
- **What's next.** Connect the indexer to Stellar RPC and the anchorer to the deployed `ReceiptAnchor`, then deploy.

## Why this exists

An escrow contract settles the money, but people still need to *see* what happened and *prove* it later:

| Question | Without Studio | With Studio |
|---|---|---|
| "What happened to my purchase?" | Read raw contract events in an explorer | A timeline page per pact: opened, verdict, settled or released, with links to every transaction |
| "Can I prove I paid for this?" | Trust the seller's server | A certificate: a receipt plus a Merkle proof against a root anchored on Stellar |
| "Is the certificate real?" | Ask whoever issued it | Check the proof yourself, offline, or against `ReceiptAnchor.verify_receipt` on-chain |
| "How is my business doing?" | Spreadsheet the events | Merchant dashboard: revenue, refund and dispute rates, cost per route |
| "What are my agents spending?" | Track every wallet by hand | Principal view: budgets and live pacts per agent |

Anchoring each receipt in its own transaction would be expensive. Studio batches many receipts into
one Merkle tree and anchors only its root, so a single small transaction covers hundreds of receipts.
Each receipt can still be proven on its own.

## Who uses it

| Who | Page | What they see |
|---|---|---|
| **Anyone** | `/pact/<id>` | The public timeline of one pact, with Stellar Expert links per network |
| **Anyone** | `/verify` | Paste a certificate and check its proof offline, then check the anchored root on-chain |
| **Sellers** | `/merchant` | Revenue, refund and dispute rates, cost per route |
| **Agent owners** | `/principal` | Budgets and live pacts for each agent they run |
| **Operators** | `/api/ops/health` | Sponsor balance, indexer lag, pending certificates, verifier error rate |

## How a receipt becomes provable

```mermaid
flowchart LR
    P[pact contract<br/>events] -->|indexer<br/>every 5 min| DB[(Postgres<br/>pacts, events,<br/>receipts)]
    DB -->|anchorer<br/>hourly| T[Merkle tree<br/>of receipt leaves]
    T -->|root| RA[ReceiptAnchor<br/>on Stellar]
    T -->|proof per leaf| C[Certificate]
    C -->|offline check| U[Anyone]
    RA -->|verify_receipt| U
```

1. **Index.** The indexer reads `pact` and `RefundVault` events from Stellar RPC, keeps a cursor and writes idempotently, so a re-run never double-counts. If it falls behind RPC retention, it backfills from a history source and raises an alert at 50% of the retention window.
2. **Make a receipt.** When a pact reaches a final state (settled, released or refunded), its outcome is hashed into a receipt *leaf*. The leaf covers who paid whom, how much and in which transaction.
3. **Batch.** The anchorer collects pending leaves into a sorted-pair SHA-256 Merkle tree, the same format as Accensa's `ReceiptAnchor`. A batch is limited by a maximum size and a minimum interval.
4. **Anchor.** The tree's root is written on-chain with `anchor_batch`. If the process crashes between submitting and saving, the next run reconciles from the chain first.
5. **Certify.** Each receipt gets its proof, the list of sibling hashes from leaf to root. Together they form the certificate. Anyone can recompute the root offline and compare it with the anchored one.

## What works today

| Piece | Status | Notes |
|---|---|---|
| Postgres schema and migrations | ✅ Working | `001_core.sql`, `002_accounts.sql`, `003_receipt_anchor_v020.sql`. Each file is applied once; the runner records what it applied |
| Indexer: Stellar RPC `getEvents` | ✅ Testnet | `pact` events and RefundVault refunds, one cursor per source, one database transaction per event, idempotent |
| Receipt leaves | ✅ Working | Byte for byte as the contract's `receipt_leaf`, tested against its vectors. Each receipt keeps its leaf inputs so anyone can recompute it |
| Anchorer: `anchor_batch` | ✅ Testnet | Real transactions signed by the ReceiptAnchor admin key. Batch 1: 9 receipts, [`be51068e…`](https://stellar.expert/explorer/testnet/tx/be51068eea65b8f47799253ca45bd5e5d9c014d7cae0b873f19150658d8edfb0) |
| Crash safety | ✅ Working | Each batch is recorded as a plan before it's sent; the next run settles plans against the chain, so a batch is never anchored twice or lost |
| Certificates | ✅ Testnet | Every anchored proof verifies offline and with ReceiptAnchor's own `verify_receipt` |
| Lag alerting | ✅ Working | Alert at 50% of RPC retention |
| Backfill from a history source | 🚧 Not yet | If the cursor falls outside RPC retention, `sync` stops with an error rather than skip events (S-03) |
| M0 pacts | 🚧 Not yet | M0 pacts aren't opened on-chain, so Studio learns of them from the facilitator (X-*). Until then, their refunds are skipped |
| Pact timeline, certificate viewer | ✅ Working | Playwright end-to-end tests |
| Merchant dashboard, principal view | 🧪 Seeded data | No sign-in yet |
| Ops health probes | 🚧 Partial | Indexer lag, RPC retention and the anchoring backlog are measured; sponsor balance and verifier error rate aren't yet |
| Pollar Studio storefront template | ✅ Template | `templates/pollar-studio`, built with the public Pollar SDK only |
| Hosted deployment | 📋 Not yet | `render.yaml` is ready; waiting on the Render deploy (S-10) |

Run the live check yourself (it sends real `anchor_batch` transactions):

```bash
DATABASE_URL=… ANCHORER_SECRET=S… STELLAR_NETWORK=testnet STELLAR_RPC_URL=https://soroban-testnet.stellar.org \
PACT_CONTRACT_ID=CDUXJJUNYFILEYHE3LITANJEKCDFERNAABOSG75OWATFVM776BCMFEV6 \
RECEIPT_ANCHOR_ID=CAEO5GBC3ULRC5RYBSCSOXLNXHU2HZAHNW5HY5LZM3DIPFMX357ILNJ2 INDEX_START_LEDGER=… \
pnpm --filter web live:testnet
```

## Pages and API

| Route | Kind | Purpose |
|---|---|---|
| `/pact/[id]` | Page | Public pact timeline |
| `/verify` | Page | Certificate viewer: offline proof plus on-chain status |
| `/merchant` | Page | Seller dashboard |
| `/principal` | Page | Agent owner view |
| `GET /api/pacts/:id` | API | A pact and its events |
| `GET /api/certificates/:id` | API | A certificate: `pending` until anchored, then `anchored` with its proof |
| `GET /api/sync` | Cron | One indexer cycle (requires `CRON_SECRET`) |
| `GET /api/anchor` | Cron | One anchoring cycle (requires `CRON_SECRET`) |
| `GET /api/ops/health` | Ops | Health and monitoring signals |

## Run it locally

Requires Node.js 24, pnpm 10 and a PostgreSQL database.

```bash
git clone https://github.com/Pactwright/Pactwright-studio.git && cd Pactwright-studio
pnpm install
cp .env.example .env          # set DATABASE_URL, e.g. postgres://localhost:5432/pactwright
pnpm db:migrate               # creates the schema
pnpm db:seed                  # loads fixture pacts, receipts and accounts
pnpm dev                      # http://localhost:3000
```

```bash
pnpm typecheck
pnpm test                     # 48 unit tests
pnpm --filter web e2e         # Playwright end-to-end tests
```

## Deploy

Testnet is hosted on Render from [`render.yaml`](render.yaml): the web app, a managed Postgres,
and two cron jobs that call `/api/sync` every 5 minutes and `/api/anchor` every hour.
Migrations run before every deploy. Not live yet (S-10). The public URL goes here once it is.

1. Render Dashboard → **New → Blueprint** → this repo.
2. Fill in the `sync: false` values when asked. They stay in Render's secret store:
   `ANCHORER_SECRET` (the `ReceiptAnchor` admin key, testnet only), `INDEX_START_LEDGER`,
   `REFUND_VAULT_IDS` and `FACILITATOR_URL`. `CRON_SECRET` is generated and shared with the crons.
3. Check `/api/ops/health`: indexer lag must stay under 50% of RPC retention.

[`vercel.json`](vercel.json) keeps the same two schedules for a Vercel deployment.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Managed Postgres connection string |
| `STELLAR_NETWORK`, `STELLAR_NETWORK_PASSPHRASE`, `STELLAR_RPC_URL` | Network. Startup fails if these are incomplete or inconsistent |
| `HISTORY_SOURCE_URL` | Backfill source when the cursor falls outside RPC retention |
| `PACT_CONTRACT_ID`, `RECEIPT_ANCHOR_ID`, `FACILITATOR_URL` | What to index and where to anchor ([addresses](https://github.com/Pactwright/Pactwright-contracts/blob/main/DEPLOYMENTS.md)) |
| `INDEX_START_LEDGER`, `REFUND_VAULT_IDS` | First ledger to index; RefundVaults whose refunds are indexed |
| `ANCHORER_SECRET` | `ReceiptAnchor` admin key, testnet only (refused on pubnet) |
| `ANCHORER_SECRET_REF` | KMS reference to the anchorer key for pubnet (not supported yet) |
| `CRON_SECRET` | Protects `/api/sync` and `/api/anchor` |

```bash
DATABASE_URL="<hosted-postgres-url>" pnpm db:migrate
```

## Data model

| Table | Holds |
|---|---|
| `pacts` | One row per pact: parties, cap, state, amounts, deadlines |
| `pact_events` | Every on-chain event, keyed so a re-index is idempotent |
| `verdicts` | Verifier envelopes and attestations per pact and milestone |
| `receipts` | One leaf per final outcome, with its batch and proof once anchored |
| `receipt_batches` | Each anchored Merkle root and its transaction |
| `sync_state` | The indexer's cursor per source |
| `sellers`, `routes`, `agents`, `budgets` | Accounts for the dashboards (v1) |

## Layout

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

## Testnet pacts to index

These are the pacts Studio will index and anchor first. Every MVP scenario ran as real testnet
transactions on 2026-10-29 ([Pactwright-Kit testnet e2e](https://github.com/Pactwright/Pactwright-Kit/tree/main/e2e/testnet)).
Studio doesn't show them yet: reading events from Stellar RPC (S-02) and anchoring (S-04) come next.

| Scenario | Outcome | Transactions |
|---|---|---|
| M0 ALLOW | ALLOW, seller keeps 1 | [`e1105f24…`](https://stellar.expert/explorer/testnet/tx/e1105f24d40640eb66a73968c06ae4eedc9f860097a086b0f4450c25995c6600) |
| M0 DENY | DENY, 1 refunded | [`ae9975c0…`](https://stellar.expert/explorer/testnet/tx/ae9975c028fe6d6bb2159cf4b532cebf42dc6ff8de095adedbac29b52542b8a3) · [`2b78feb8…`](https://stellar.expert/explorer/testnet/tx/2b78feb8459b4731aa50bae1a290e3fd84a9a2b4956f5c6d2b7ae4f615bfae59) |
| M0 non-delivery | DENY, 0.5 refunded | [`df8af0bd…`](https://stellar.expert/explorer/testnet/tx/df8af0bd9c8f4be9477589d9991ab063134b0e9f92094a90218f5edc9a629005) · [`01357475…`](https://stellar.expert/explorer/testnet/tx/013574756ece7ae81643893f00fb14a2b220d54d096d936ea083a45129189b00) |
| M2 ALLOW | ALLOW 0.75 of 1, settled | [`0b08b71e…`](https://stellar.expert/explorer/testnet/tx/0b08b71e164252de154d6500b3b8c23c0d68f6a8a1710b87b86e79bbe1166f6c) · [`84a6549a…`](https://stellar.expert/explorer/testnet/tx/84a6549aaa6b61b0e8040d1b43f2819914dc0e40f52d85be871f455d0d5a3e71) · [`9fda6bea…`](https://stellar.expert/explorer/testnet/tx/9fda6beadb02f863f74e220820642a4509f269c31e3462fccf6318e1e2fa11c5) |
| M2 DENY | DENY, full refund | [`b953ee00…`](https://stellar.expert/explorer/testnet/tx/b953ee00524d5b0a9b53308ab1e370a2008fb82b7f5a949ac1934d2aa12d17a7) · [`324f630d…`](https://stellar.expert/explorer/testnet/tx/324f630d39eb88fa76a60b92617e5867421e9819c290a8f3d71ec4bd8bec9138) · [`272703bf…`](https://stellar.expert/explorer/testnet/tx/272703bfbe0a74becf50a80b5d16600396a17440a82c9b3af5c481d4748c22cf) |
| M2 silence | no verdict, refunded by silence policy | [`76df8318…`](https://stellar.expert/explorer/testnet/tx/76df83188eb7cf22c0b6c639fc0a090615ca3040ecfb6a3e43d6347cece27d59) · [`e62aff4d…`](https://stellar.expert/explorer/testnet/tx/e62aff4d291eff2b76ba282aae987d82c6ca91e1681e7944d96abb1f3739f833) |
| Dispute refund | dispute-1: 2 of 4 pages, 0.5 refunded | [`a191a000…`](https://stellar.expert/explorer/testnet/tx/a191a000f7920f2fff9839bbccceeeca35c82fce29a5e46510fd3db1bcdf2ff0) |

## Project status

The indexer and anchorer work against testnet. Next:

1. Deploy to testnet with a public URL (S-10).
2. Backfill from a history source when the indexer falls behind RPC retention (S-03).
3. Index M0 pacts once the facilitator's `pact` scheme reports them (X-*).

[ROADMAP.md](ROADMAP.md) tracks every task. Every pull request updates it.

## FAQ

**Do I have to trust Studio?** No. A certificate is a receipt plus a Merkle proof. You can recompute
the root yourself and compare it with the root anchored on Stellar, or call `verify_receipt` on the
`ReceiptAnchor` contract directly. Studio only saves you the work.

**Why batch receipts instead of anchoring each one?** Cost. One anchoring transaction covers a whole
batch, and every receipt in it can still be proven individually.

**What if Studio goes down?** The money is never in Studio: the contract holds and moves it. Pacts
keep working, and already-issued certificates stay verifiable against the anchored roots.

**Is pact data private?** No. Pact timelines are public by design, because the chain they come from
is public. The merchant and principal dashboards don't have sign-in yet, so don't put private data in
them before that lands.

## Built on

| Project | What Studio uses | How |
|---|---|---|
| [Accensa](https://github.com/accensa) | `ReceiptAnchor` (Merkle roots on-chain), `RefundVault` events, indexer patterns | Same Merkle format; anchors to `ReceiptAnchor` v0.2.0; indexes `RefundVault` refunds |
| [Tollcraft](https://github.com/Tollcraft) | Contract cost reports | Cost per route in the merchant dashboard |
| [Pollar](https://docs.pollar.xyz) | Seller storefronts | `templates/pollar-studio`, built with the public SDK only |
| [Witness](https://github.com/fabian416/witness) | Verdict envelopes | Stored with each pact (`verdicts` table) |

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md). Every pull request updates
[ROADMAP.md](ROADMAP.md): task status, progress counts and one Update log line. `main` is protected,
so pull requests need a review and green checks. The anchorer and the migrations are core-team paths
(see `CODEOWNERS`).

## License

Pactwright-studio is released under the **[MIT License](LICENSE)**.

```text
Copyright (c) 2026 Pactwright contributors
```

### What the MIT license means for you

| You may | You must | You get no |
|---|---|---|
| Use the code in open or closed-source projects, commercially or not | Keep the copyright notice and the license text in every copy or substantial portion | Warranty of any kind |
| Copy, modify, merge and publish it | | Liability from the authors for any loss |
| Distribute, sublicense and sell copies | | |
| Run your own Studio for your own pacts | | |

Running your own Studio doesn't make its certificates any less verifiable. Proofs check against
the on-chain root, not against whoever hosts the page.

### Third-party code and licenses

| Component | How it is used | License |
|---|---|---|
| [Next.js](https://www.npmjs.com/package/next) 16 | The web app | MIT |
| [React](https://www.npmjs.com/package/react) 19 | UI | MIT |
| [node-postgres (`pg`)](https://www.npmjs.com/package/pg) | Database access | MIT |
| Vitest, Playwright, TypeScript | Development and tests only, not shipped | MIT / Apache-2.0 |
| Accensa `ReceiptAnchor` format | Merkle tree format; Studio anchors to the deployed contract but includes none of its code | MIT |

Pollar Studio has no license file, so none of its code is used. The storefront template uses only
the public Pollar SDK. Every project Pactwright builds on is credited in [NOTICE](NOTICE).

### The other Pactwright repositories

| Repository | License | Why |
|---|---|---|
| [Pactwright-contracts](https://github.com/Pactwright/Pactwright-contracts) | MIT | Short, permissive terms |
| [Pactwright-Kit](https://github.com/Pactwright/Pactwright-Kit) | Apache-2.0 | It vendors Witness core, which is Apache-2.0, and adds an explicit patent grant |
| Pactwright-studio (this repo) | MIT | Same terms as the contracts |

### Contributing under this license

By opening a pull request, you agree that your contribution is licensed under the same MIT license as
the rest of the repository. There is no separate contributor license agreement.
