-- Pactwright studio — MVP schema (ARCHITECTURE §7.3). ROADMAP S-01.
-- Amounts: numeric(30,7) decimal USDC. Receipts: one leaf per terminal transition (ADR-013).

create table pacts (
  pact_id          char(64) primary key,
  mode             text not null check (mode in ('exact-refund','escrow')),
  buyer            text not null,
  seller           text not null,
  resource_url     text not null,
  cap              numeric(30,7) not null check (cap > 0),
  condition_hash   char(64) not null,
  condition        jsonb not null,
  metered          boolean not null default false,
  silence          text check (silence in ('refund','pay')),
  state            text not null check (state in ('funded','paid','allowed','denied','settled','released','refunded')),
  verdict_deadline integer,
  settle_deadline  integer,
  to_seller        numeric(30,7) not null default 0,
  to_buyer         numeric(30,7) not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (buyer <> seller)
);
create index pacts_seller_state on pacts (seller, state);
create index pacts_buyer on pacts (buyer, created_at desc);

create table pact_events (
  id               bigserial primary key,
  pact_id          char(64) not null references pacts(pact_id),
  stage            text not null check (stage in ('opened','paid','verdict','settled','meter_closed','released','refunded')),
  tx_hash          text,
  ledger           integer,
  data             jsonb not null,
  unique (tx_hash, stage, pact_id)
);

create table verdicts (
  envelope_hash    char(64) primary key,
  pact_id          char(64) not null references pacts(pact_id),
  milestone        text not null,      -- 'delivery' | 'dispute-<n>'
  verdict          text not null check (verdict in ('ALLOW','DENY')),
  amount           numeric(30,7),
  envelope         jsonb not null,     -- Witness verdict-v1
  attested         boolean not null default false,
  created_at       timestamptz not null default now(),
  unique (pact_id, milestone)
);

create table receipt_batches (
  batch_id         bigint primary key,
  shard_id         bigint not null,
  root             char(64) not null,
  leaf_count       integer not null,
  anchor_tx        text not null,
  anchored_at      timestamptz not null
);

create table receipts (
  leaf             char(64) primary key,
  pact_id          char(64) not null references pacts(pact_id),  -- not unique: one leaf per transition
  transition       text not null check (transition in ('paid','settled','released','refunded')),
  batch_id         bigint references receipt_batches(batch_id),  -- null while pending
  proof            jsonb
);
create index receipts_pact on receipts (pact_id);
create index receipts_pending on receipts (batch_id) where batch_id is null;

create table sync_state (
  -- One row per source the indexer reads. `sources()` (apps/web/lib/indexer/sources.ts) names them:
  -- 'pact', and 'refund_vault:<contractId>' for each entry in REFUND_VAULT_IDS.
  --
  -- 'facilitator' is reserved by ARCHITECTURE.md §7.3 for the source studio#50 asks for, and no pass
  -- writes it, because there is nothing to read yet. Verified 2026-11-05 against the facilitator code
  -- studio deploys (Pactwright-Kit/deploy/facilitator) and the live testnet instance: it keeps no pact
  -- record (a settlement aggregate is keyed by the caller's Idempotency-Key, or sha256 of the buyer's
  -- payment XDR -- neither of which studio holds), it exposes no route that lists pacts (GET /pacts
  -- answers 404 route_not_found, and GET /settlements/:key needs the caller's own key), the two store
  -- methods that could enumerate are called by no route, and it runs with no DATABASE_URL, so its state
  -- is one instance's memory. That source needs a pact-read route upstream in Accensa and a durable
  -- store before it can exist here -- an ADR before the code (AGENTS.md §4). Seeding a 'facilitator'
  -- cursor would have been worse than inert: the first real source would read it as "already indexed
  -- through this ledger" and skip every event before it.
  source           text primary key,
  cursor_ledger    integer not null
);
