# pactwright-studio

**Pact pages, certificates, indexer and anchorer for Pactwright.**

[![ci](https://github.com/Pactwright/Pactwright-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/Pactwright/Pactwright-studio/actions/workflows/ci.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/Pactwright/Pactwright-studio/badge)](https://scorecard.dev/viewer/?uri=github.com/Pactwright/Pactwright-studio)

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

## Contributing
Read [`CONTRIBUTING.md`](CONTRIBUTING.md). **Every PR updates [`ROADMAP.md`](ROADMAP.md).**
