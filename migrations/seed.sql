-- Seed data for local development and testing. ROADMAP S-01.

-- 1. Pollar & accensa test sellers
insert into sellers (address, name, delivery_key, refund_vault) values
  ('GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5', 'Pollar Weather API', '4444444444444444444444444444444444444444444444444444444444444444', null),
  ('GCEXAMPLESELLERACCOUNT2222222222222222222222222222222222222222', 'Inference Cloud', '5555555555555555555555555555555555555555555555555555555555555555', 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
on conflict (address) do nothing;

-- 2. Test routes
insert into routes (seller, resource_url, mode, price, verify_min_amount, silence, verdict_ledgers, settle_ledgers, refund_window_ledgers) values
  ('GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5', 'https://api.pactwright.dev/data/weather', 'escrow', 10.0000000, 5.0000000, 'refund', 500, 1000, 100),
  ('GCEXAMPLESELLERACCOUNT2222222222222222222222222222222222222222', 'https://api.pactwright.dev/compute/inference', 'exact-refund', 5.0000000, null, 'refund', null, null, 200)
on conflict (seller, resource_url) do nothing;

-- 3. Test agent and budget
insert into agents (address, principal, label) values
  ('GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVWGS', 'GCPRINCIPALACCOUNT0000000000000000000000000000000000000000', 'Weather Scraper Agent')
on conflict (address) do nothing;

insert into budgets (agent, amount, asset, status, gate) values
  ('GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVWGS', 100.0000000, 'USDC', 'funded', 'manual')
on conflict do nothing;

-- 4. Pact 1: Settled Escrow Pact (with verdict and anchored receipt batch)
insert into pacts (
  pact_id, mode, buyer, seller, resource_url, cap, condition_hash,
  condition, metered, silence, state, verdict_deadline, settle_deadline,
  to_seller, to_buyer
) values (
  '1111111111111111111111111111111111111111111111111111111111111111',
  'escrow',
  'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVWGS',
  'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  'https://api.pactwright.dev/data/weather',
  10.0000000,
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  '{"type": "http-match", "method": "GET"}'::jsonb,
  false,
  'refund',
  'settled',
  50000000,
  50001000,
  10.0000000,
  0.0000000
) on conflict (pact_id) do nothing;

insert into pact_events (pact_id, stage, tx_hash, ledger, data) values
  ('1111111111111111111111111111111111111111111111111111111111111111', 'opened', 'tx_open_1111111111111111111111111111111111111111111111111111111111111111', 49999900, '{"cap": "10.0000000", "mode": "escrow"}'::jsonb),
  ('1111111111111111111111111111111111111111111111111111111111111111', 'verdict', 'tx_verdict_1111111111111111111111111111111111111111111111111111111111111111', 49999950, '{"verdict": "ALLOW", "amount": "10.0000000"}'::jsonb),
  ('1111111111111111111111111111111111111111111111111111111111111111', 'settled', 'tx_settle_1111111111111111111111111111111111111111111111111111111111111111', 50000020, '{"to_seller": "10.0000000", "to_buyer": "0.0000000"}'::jsonb)
on conflict do nothing;

insert into verdicts (envelope_hash, pact_id, milestone, verdict, amount, envelope, attested) values (
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  '1111111111111111111111111111111111111111111111111111111111111111',
  'delivery',
  'ALLOW',
  10.0000000,
  '{"milestone": "delivery", "verdict": "ALLOW", "amount": "10.0000000"}'::jsonb,
  true
) on conflict (envelope_hash) do nothing;

insert into receipt_batches (batch_id, shard_id, root, leaf_count, anchor_tx, anchored_at) values (
  1,
  0,
  'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
  1,
  'tx_anchor_batch_001',
  now()
) on conflict (batch_id) do nothing;

insert into receipts (leaf, pact_id, transition, batch_id, proof) values (
  'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
  '1111111111111111111111111111111111111111111111111111111111111111',
  'settled',
  1,
  '["dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"]'::jsonb
) on conflict (leaf) do nothing;

-- 5. Pact 2: Active Exact-Refund Pact
insert into pacts (
  pact_id, mode, buyer, seller, resource_url, cap, condition_hash,
  condition, metered, silence, state, verdict_deadline, settle_deadline,
  to_seller, to_buyer
) values (
  '2222222222222222222222222222222222222222222222222222222222222222',
  'exact-refund',
  'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVWGS',
  'GCEXAMPLESELLERACCOUNT2222222222222222222222222222222222222222',
  'https://api.pactwright.dev/compute/inference',
  5.0000000,
  'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  '{"type": "hash-preimage"}'::jsonb,
  false,
  'refund',
  'funded',
  50005000,
  50006000,
  0.0000000,
  0.0000000
) on conflict (pact_id) do nothing;

insert into pact_events (pact_id, stage, tx_hash, ledger, data) values
  ('2222222222222222222222222222222222222222222222222222222222222222', 'opened', 'tx_open_2222222222222222222222222222222222222222222222222222222222222222', 50000100, '{"cap": "5.0000000", "mode": "exact-refund"}'::jsonb)
on conflict do nothing;

-- 6. Pact 3: Refunded Pact (pending receipt anchor)
insert into pacts (
  pact_id, mode, buyer, seller, resource_url, cap, condition_hash,
  condition, metered, silence, state, verdict_deadline, settle_deadline,
  to_seller, to_buyer
) values (
  '3333333333333333333333333333333333333333333333333333333333333333',
  'exact-refund',
  'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVWGS',
  'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  'https://api.pactwright.dev/data/weather',
  2.5000000,
  'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
  '{"type": "timeout"}'::jsonb,
  false,
  'refund',
  'refunded',
  49990000,
  49991000,
  0.0000000,
  2.5000000
) on conflict (pact_id) do nothing;

insert into pact_events (pact_id, stage, tx_hash, ledger, data) values
  ('3333333333333333333333333333333333333333333333333333333333333333', 'opened', 'tx_open_3333333333333333333333333333333333333333333333333333333333333333', 49989000, '{"cap": "2.5000000"}'::jsonb),
  ('3333333333333333333333333333333333333333333333333333333333333333', 'refunded', 'tx_refund_3333333333333333333333333333333333333333333333333333333333333333', 49991100, '{"to_buyer": "2.5000000"}'::jsonb)
on conflict do nothing;

insert into receipts (leaf, pact_id, transition, batch_id, proof) values (
  '3333333333333333333333333333333333333333333333333333333333333333',
  '3333333333333333333333333333333333333333333333333333333333333333',
  'refunded',
  null,
  null
) on conflict (leaf) do nothing;

-- 7. Sync state
insert into sync_state (source, cursor_ledger) values
  ('pact', 50000200),
  ('facilitator', 50000200)
on conflict (source) do update set cursor_ledger = excluded.cursor_ledger;
