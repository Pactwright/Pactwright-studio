-- Events whose pact Studio has not indexed yet, kept for replay instead of dropped. ROADMAP S-12, #51.
--
-- `pact_events.pact_id` references `pacts`, so a refund that arrives before the pact's `opened` event
-- cannot be written at all. Before this table the indexer counted it as skipped and moved the source's
-- cursor past it, which lost the event permanently. The indexer now writes it here — deliberately with
-- no foreign key to `pacts` — and replays it at the end of every pass once the pact exists.
--
-- Retaining rather than pinning the cursor is what keeps a refund for a pact that never arrives (an M0
-- pact whose facilitator record was never reported) from stalling the whole source behind it.

create table deferred_events (
  id              bigserial primary key,
  source          text not null,
  pact_id         char(64) not null,
  stage           text not null check (stage in ('opened','paid','verdict','settled','meter_closed','released','refunded')),
  tx_hash         text not null,
  ledger          integer not null,
  event           jsonb not null,     -- the decoded event exactly as `persistEvents` received it
  attempts        integer not null default 0,
  first_seen_at   timestamptz not null default now(),
  last_attempt_at timestamptz,
  unique (tx_hash, stage, pact_id)
);

create index idx_deferred_events_pact on deferred_events(pact_id);
create index idx_deferred_events_ledger on deferred_events(ledger, id);
