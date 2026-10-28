# pactwright-studio

**Pact pages, certificates, indexer and anchorer for Pactwright.**

> Status: scaffold. See [`ROADMAP.md`](ROADMAP.md).

- `apps/web/app/pact/[id]` — public pact timeline
- `apps/web/app/verify` — certificate viewer (offline + on-chain)
- `apps/web/lib/indexer` — Stellar RPC `getEvents` + backfill
- `apps/web/lib/anchorer` — batches receipt leaves into Accensa `ReceiptAnchor`
- `migrations/` — Postgres schema (`001_core.sql` MVP, `002_accounts.sql` v1)

## Quickstart
```bash
pnpm install
psql "$DATABASE_URL" -f migrations/001_core.sql
pnpm dev
```

## Contributing
Read [`CONTRIBUTING.md`](CONTRIBUTING.md). **Every PR updates [`ROADMAP.md`](ROADMAP.md).**
