-- Release v1 (ROADMAP P7-10, P7-11). Designed now for scope; applied in v1.

create table sellers (
  address          text primary key,
  name             text not null,
  delivery_key     char(64) not null,       -- ed25519 public key (hex) for X-Pactwright-Delivery
  refund_vault     text,                    -- M0 RefundVault contract ID
  created_at       timestamptz not null default now()
);

create table routes (
  id                    bigserial primary key,
  seller                text not null references sellers(address),
  resource_url          text not null,
  mode                  text not null check (mode in ('exact-refund','escrow')),
  price                 numeric(30,7) not null,
  verify_min_amount     numeric(30,7),
  silence               text check (silence in ('refund','pay')),
  verdict_ledgers       integer,
  settle_ledgers        integer,
  refund_window_ledgers integer not null,
  meter_unit            text,
  meter_unit_price      numeric(30,7),
  unique (seller, resource_url)
);

create table agents (
  address          text primary key,
  principal        text not null,
  label            text,
  created_at       timestamptz not null default now()
);

create table budgets (
  id               bigserial primary key,
  agent            text not null references agents(address),
  amount           numeric(30,7) not null check (amount > 0),
  asset            text not null default 'USDC',
  status           text not null check (status in ('pending','approved','funded','expired')),
  gate             text not null default 'manual',   -- 'manual' | 'vespi'
  funding_tx       text,
  created_at       timestamptz not null default now(),
  expires_at       timestamptz
);
