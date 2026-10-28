# pactwright-studio

**Pact pages, certificates, indexer and anchorer for Pactwright.**

> Status: scaffold. See [`ROADMAP.md`](ROADMAP.md).

- `apps/web/app/pact/[id]` — public pact timeline
- `apps/web/app/verify` — certificate viewer (offline + on-chain)
- `apps/web/lib/indexer` — Stellar RPC `getEvents` + backfill
- `apps/web/lib/anchorer` — batches receipt leaves into Accensa `ReceiptAnchor`
- `migrations/` — Postgres schema (`001_core.sql` MVP, `002_accounts.sql` v1)

## Quickstart

### Prerequisites
- Node.js >= 24
- pnpm >= 10
- PostgreSQL database

### Local Setup
1. Clone the repository and install dependencies:
   ```bash
   pnpm install
   ```

2. Configure environment variables in `.env`:
   ```bash
   cp .env.example .env
   # Ensure DATABASE_URL is set (e.g. postgres://localhost:5432/pactwright)
   ```

3. Run migrations to create database schema:
   ```bash
   pnpm db:migrate
   ```

4. Populate fixtures and seed data for local testing:
   ```bash
   pnpm db:seed
   ```

5. Start the Next.js development server:
   ```bash
   pnpm dev
   ```

6. Run unit tests and type checks:
   ```bash
   pnpm typecheck
   pnpm test
   ```

## Testnet Deployment (ROADMAP S-10)

Pactwright Studio is designed to be deployed to Vercel (or any cloud container platform) paired with Managed PostgreSQL and automated cron jobs.

### Configuration
Set the following environment variables in your hosting environment:
- `DATABASE_URL`: Connection string to managed Postgres instance (e.g. Neon, Supabase, AWS RDS, or Render Postgres).
- `CRON_SECRET`: Random 256-bit secret string protecting automated synchronization endpoints.
- `NEXT_PUBLIC_STELLAR_NETWORK`: `testnet` (or `pubnet` for production).
- `RECEIPT_ANCHOR_CONTRACT_ID`: Deployed Accensa `ReceiptAnchor` Soroban contract address on testnet.

### Database Setup
Run migrations against the hosted database:
```bash
DATABASE_URL="<hosted-postgres-url>" pnpm db:migrate
DATABASE_URL="<hosted-postgres-url>" pnpm db:seed
```

### Automated Sync & Anchoring
The repository includes `vercel.json` configuring Vercel Cron jobs:
- `/api/sync`: Runs every 5 minutes (`*/5 * * * *`) to ingest chain events.
- `/api/anchor`: Runs hourly (`0 * * * *`) to batch terminal receipt leaves into Merkle trees and anchor on-chain.

### Public Endpoints & Verification
- Public Pact Timeline: `https://studio.pactwright.dev/pact/<id>`
- Offline Certificate Verification: `https://studio.pactwright.dev/verify`
- Merchant Dashboard: `https://studio.pactwright.dev/merchant`
- Principal View: `https://studio.pactwright.dev/principal`
- Ops Health Probes: `https://studio.pactwright.dev/api/ops/health`

## Contributing
Read [`CONTRIBUTING.md`](CONTRIBUTING.md). **Every PR updates [`ROADMAP.md`](ROADMAP.md).**
