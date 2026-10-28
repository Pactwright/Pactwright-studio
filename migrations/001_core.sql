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
  source           text primary key,   -- 'pact' | 'facilitator' | 'refund_vault:<id>'
  cursor_ledger    integer not null
);
