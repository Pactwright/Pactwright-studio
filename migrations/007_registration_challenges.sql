-- One-time challenges that prove a seller registration was made by the account it names. ROADMAP P7-21, studio#88.
--
-- `sellers` was only ever filled by `migrations/seed.sql`, so a row appeared in Studio by assertion:
-- nothing checked that the person who typed `GBBD47IF…` holds that account's secret key. A signature
-- over a challenge Studio issued is that check, and it has to be single-use, or a captured signature
-- becomes a permanent registration token.
--
-- The row is the authority for what was signed: `payload` is the exact text shown to the seller, and
-- the confirmation step re-reads it instead of trusting the browser, so an edited name or refund vault
-- in a replayed request is not what gets inserted. `consumed_at` is set by a conditional UPDATE rather
-- than a read-then-write, so two requests carrying the same token cannot both get through.
--
-- A challenge that was never completed is kept, not deleted: it is one row of audit for an event that
-- no longer matters, and "when did someone try to register this account" is worth being able to ask.

create table registration_challenges (
  token         char(64) primary key,          -- 32 random bytes, hex
  address       text not null,                 -- the account that must sign
  name          text not null,
  delivery_key  char(64) not null,             -- seller's ed25519 delivery key, hex
  refund_vault  text,
  payload       text not null,                 -- the exact text shown for signing
  issued_at     timestamptz not null default now(),
  expires_at    timestamptz not null,
  consumed_at   timestamptz
);

create index idx_registration_challenges_address on registration_challenges(address, issued_at desc);
