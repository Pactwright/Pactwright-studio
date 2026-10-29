-- ReceiptAnchor v0.2.0 (the deployed version) has no shards, and the on-chain batch id is the
-- one verify_receipt needs. Receipts keep the exact leaf inputs so anyone can recompute a leaf
-- from a certificate. ROADMAP S-02, S-04.

alter table receipt_batches drop column shard_id;
alter table receipt_batches add column anchored_ledger integer;
alter table receipt_batches add constraint receipt_batches_anchor_tx_unique unique (anchor_tx);

alter table receipts add column to_seller_stroops numeric(39,0);
alter table receipts add column to_buyer_stroops  numeric(39,0);
alter table receipts add column envelope_hash     char(64);
alter table receipts add column ledger            integer;

-- A batch is recorded here before `anchor_batch` is sent. If the process stops between sending
-- and saving, the next run compares these plans with the chain instead of anchoring twice.
alter table receipt_batches alter column anchor_tx drop not null;  -- null only for batches recovered after a crash
create table anchor_plans (
  batch_id         bigint primary key,   -- the id ReceiptAnchor will assign (its batch count + 1)
  root             char(64) not null,
  leaves           jsonb not null,       -- leaf order used to build the tree
  created_at       timestamptz not null default now()
);
