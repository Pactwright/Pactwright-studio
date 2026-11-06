-- Seed data for local development and testing. ROADMAP S-01.

-- 1. Pollar & accensa test sellers
-- The refund on pact 3 below has to come from a vault, so Pollar's row names a checksummed Accensa
-- RefundVault contract id. Inference Cloud keeps the placeholder key this file has always used.
insert into sellers (address, name, delivery_key, refund_vault) values
  ('GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5', 'Pollar Weather API', '4444444444444444444444444444444444444444444444444444444444444444', 'CAN4XKE3YUTQDPF6A3VCUWGITJSE53FWQRRSRXMS5PCG4LFVUMNIXMYX'),
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

-- The event bodies are what the pact contract emits (Pactwright-contracts contracts/pact/src/events.rs):
-- amounts in stroops, `verdict` 1 = ALLOW, `silence` 1 = refund, and `pact_id` inside the data. They used
-- to be written as decimal amounts and "ALLOW", which lib/format.ts cannot parse — every timeline block
-- for these three pacts then read "The cap USDC locked in escrow." instead of a number.
insert into pact_events (pact_id, stage, tx_hash, ledger, data) values
  ('1111111111111111111111111111111111111111111111111111111111111111', 'opened', 'tx_open_1111111111111111111111111111111111111111111111111111111111111111', 49999900, '{"pact_id": "1111111111111111111111111111111111111111111111111111111111111111", "buyer": "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVWGS", "seller": "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5", "cap": "100000000", "condition_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "metered": false, "silence": 1, "verdict_deadline": 50000000, "settle_deadline": 50001000}'::jsonb),
  ('1111111111111111111111111111111111111111111111111111111111111111', 'verdict', 'tx_verdict_1111111111111111111111111111111111111111111111111111111111111111', 49999950, '{"pact_id": "1111111111111111111111111111111111111111111111111111111111111111", "verdict": 1, "amount": "100000000", "envelope_hash": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}'::jsonb),
  ('1111111111111111111111111111111111111111111111111111111111111111', 'settled', 'tx_settle_1111111111111111111111111111111111111111111111111111111111111111', 50000020, '{"pact_id": "1111111111111111111111111111111111111111111111111111111111111111", "to_seller": "100000000", "to_buyer": "0"}'::jsonb)
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

-- Batch 1 held the pact above under a root copied from the condition hashes, not computed from a leaf.
-- The certificate page recomputes the leaf from the receipt's own inputs (lib/verify.ts) and compares, so
-- /verify?id=<pact 1> answered "Leaf Mismatch". A one-leaf batch's root is that leaf, and a settle takes
-- the envelope of the pact's attested delivery verdict — which is why envelope_hash is the verdict above.
delete from receipts where leaf = 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc' and pact_id = '1111111111111111111111111111111111111111111111111111111111111111';

insert into receipt_batches (batch_id, root, leaf_count, anchor_tx, anchored_at, anchored_ledger) values (
  1,
  '29ae75bec117ab82373af269023a8fac172f93114b09c4431e4d1dc6650728e6',
  1,
  'tx_anchor_batch_001',
  now(),
  50000050
) on conflict (batch_id) do update set root = excluded.root, leaf_count = excluded.leaf_count;

insert into receipts (leaf, pact_id, transition, batch_id, proof, to_seller_stroops, to_buyer_stroops, envelope_hash, ledger) values (
  '29ae75bec117ab82373af269023a8fac172f93114b09c4431e4d1dc6650728e6',
  '1111111111111111111111111111111111111111111111111111111111111111',
  'settled',
  1,
  '[]'::jsonb,
  100000000,
  0,
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  50000020
) on conflict (leaf) do update set proof = excluded.proof, envelope_hash = excluded.envelope_hash;

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
  ('2222222222222222222222222222222222222222222222222222222222222222', 'opened', 'tx_open_2222222222222222222222222222222222222222222222222222222222222222', 50000100, '{"pact_id": "2222222222222222222222222222222222222222222222222222222222222222", "buyer": "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVWGS", "seller": "GCEXAMPLESELLERACCOUNT2222222222222222222222222222222222222222", "cap": "50000000", "condition_hash": "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", "metered": false, "silence": 1, "verdict_deadline": 50005000, "settle_deadline": 50006000}'::jsonb)
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
  ('3333333333333333333333333333333333333333333333333333333333333333', 'opened', 'tx_open_3333333333333333333333333333333333333333333333333333333333333333', 49989000, '{"pact_id": "3333333333333333333333333333333333333333333333333333333333333333", "buyer": "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVWGS", "seller": "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5", "cap": "25000000", "condition_hash": "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", "metered": false, "silence": 1, "verdict_deadline": 49990000, "settle_deadline": 49991000}'::jsonb),
  -- A refund is not a pact-contract event: it comes from the seller's RefundVault, whose topic is
  -- ("refund_event", pact_id) and whose body is { amount, ledger, recipient } plus the vault the
  -- indexer read it from (lib/indexer/sources.ts, decodeRefundVaultEvent).
  ('3333333333333333333333333333333333333333333333333333333333333333', 'refunded', 'tx_refund_3333333333333333333333333333333333333333333333333333333333333333', 49991100, '{"amount": "25000000", "ledger": 49991100, "recipient": "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVWGS", "vault": "CAN4XKE3YUTQDPF6A3VCUWGITJSE53FWQRRSRXMS5PCG4LFVUMNIXMYX"}'::jsonb)
on conflict do nothing;

-- The pending receipt used to be keyed by the pact id, which is not its own leaf, so the certificate
-- page showed a refund with inputs that hashed to something else. Same repair as batch 1 above.
delete from receipts where leaf = '3333333333333333333333333333333333333333333333333333333333333333' and batch_id is null;

insert into receipts (leaf, pact_id, transition, batch_id, proof, to_seller_stroops, to_buyer_stroops, envelope_hash, ledger) values (
  '691068978b6969c08363b61edde12568e83b912cfda107e0acaa4b73c87985a6',
  '3333333333333333333333333333333333333333333333333333333333333333',
  'refunded',
  null,
  null,
  0,
  25000000,
  null,
  49991100
) on conflict (leaf) do nothing;

-- 7. Sync state
-- Only sources the indexer actually reads. 'facilitator' used to be seeded here at the same ledger as
-- 'pact', for a source no pass touches — and a future facilitator source would have read it as "already
-- indexed through 50000200" and skipped everything before it (studio#50).
insert into sync_state (source, cursor_ledger) values
  ('pact', 50000200)
on conflict (source) do update set cursor_ledger = excluded.cursor_ledger;

-- =============================================================================
-- 8. DEMO LEDGER — mock data for a screenshot-ready Studio, not chain data.
--
-- Five sellers, three principals with five agents, and seventeen pacts that cover every state the
-- pages can show: escrow and exact-refund, metered and flat, settled, released, refunded, denied, paid,
-- allowed and funded. Nothing here was indexed: the addresses are valid testnet StrKey accounts derived
-- from the names below, and every hash is sha256 of the value printed beside it, so a reader can
-- reproduce any of them. The receipt leaves and Merkle proofs are computed with the app's own formulas
-- (lib/verify.ts, lib/anchorer/batch.ts), which is what lets /verify recompute a leaf and pass
-- verifyReceipt instead of answering "Leaf Mismatch".
--
-- Timestamps are relative to now() and the three fixture pacts above stay the newest rows, so /pacts
-- and the home ledger keep their seeded order. Every insert is idempotent; the file can be re-applied.
--
-- Do not apply this block to a database an anchorer signs against: pending receipts are drained by
-- /api/anchor, which would send a real anchor_batch for mock leaves. That is why every receipt below
-- arrive already anchored. (The one pending receipt at the top of this file is pre-existing.)

-- 8a. Sellers. Pollar Weather API is the fixture seller above, and the oldest row, so it stays the
--     seller /merchant opens on. These three are new.
insert into sellers (address, name, delivery_key, refund_vault) values
  ('GCZR7V2EBPFQXS644CC35K5ACOBBKGGKMRS46DZ7ACTH37THRUHLOFKS', 'Northstar Research API', 'c077f90fcb322d18c5265a2cc31648fa25954d21558eaeef750d0563941eb5e7', 'CAZZQ34EXD32AKLL25XS5OKOHTUU426VSE3FAT3LLLKKVQINWQDHB2FT'),
  ('GAX7LQRK4SSPHEVPKPUHONJRROE3H65DHIUAK3323464H6QOOZSPFBMD', 'CartaGeo Maps', '67c9d1265fd133ec3e556a0747baecf924ef192ce0fc6d79c564c6e62efab897', 'CBQTFCDEPUA7TBRB2LB3M6WSCEAKNXLWYOEWEPSUS7RPZJP4UJIHJ2S4'),
  ('GA7P7K6ULQ2KH3S6PFI2FCRU5PQDZGIAFDZYJGKZOMZQXE5IISCDW2YE', 'Vespi Risk Signals', '324716f9a5af228f73207f8ee01579a0c6a28cb8be3d4d5ff09b7eb4a1ac42df', 'CDZW2QFGHXNYXJ2PW3SZR2EX6ZQKWOLOJXQKJF5BRETW2UV6QAGCBI6N')
on conflict (address) do nothing;

-- 8b. Routes: what each seller sells, at what price, and what the deadlines default to.
insert into routes (seller, resource_url, mode, price, verify_min_amount, silence, verdict_ledgers, settle_ledgers, refund_window_ledgers, meter_unit, meter_unit_price) values
  ('GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5', 'https://api.pollar.dev/data/severe-weather-alerts', 'escrow', 4.0000000, null, 'refund', 500, 1500, 200, null, null),
  ('GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5', 'https://api.pollar.dev/data/climate-historical', 'escrow', 25.0000000, 10.0000000, 'refund', 1000, 2000, 400, null, null),
  ('GCZR7V2EBPFQXS644CC35K5ACOBBKGGKMRS46DZ7ACTH37THRUHLOFKS', 'https://api.northstar.dev/v2/abstracts/embed', 'exact-refund', 2.0000000, null, 'refund', null, null, 200, null, null),
  ('GA7P7K6ULQ2KH3S6PFI2FCRU5PQDZGIAFDZYJGKZOMZQXE5IISCDW2YE', 'https://api.vespi.dev/v1/monitor-subscribe', 'escrow', 40.0000000, 20.0000000, 'pay', 500, 1500, 100, null, null),
  ('GCZR7V2EBPFQXS644CC35K5ACOBBKGGKMRS46DZ7ACTH37THRUHLOFKS', 'https://api.northstar.dev/v2/papers/search', 'exact-refund', 15.0000000, null, 'pay', null, null, 300, 'request', 0.0025000),
  ('GCZR7V2EBPFQXS644CC35K5ACOBBKGGKMRS46DZ7ACTH37THRUHLOFKS', 'https://api.northstar.dev/v2/papers/fulltext', 'escrow', 8.0000000, 4.0000000, 'refund', 500, 1500, 200, null, null),
  ('GAX7LQRK4SSPHEVPKPUHONJRROE3H65DHIUAK3323464H6QOOZSPFBMD', 'https://api.cartageo.dev/v1/geocode/batch', 'exact-refund', 0.2500000, null, 'refund', null, null, 100, 'coordinate', 0.0000500),
  ('GAX7LQRK4SSPHEVPKPUHONJRROE3H65DHIUAK3323464H6QOOZSPFBMD', 'https://api.cartageo.dev/v1/distance-matrix', 'escrow', 18.0000000, 9.0000000, 'pay', 500, 1500, 200, null, null),
  ('GA7P7K6ULQ2KH3S6PFI2FCRU5PQDZGIAFDZYJGKZOMZQXE5IISCDW2YE', 'https://api.vespi.dev/v1/risk-score', 'escrow', 120.0000000, 60.0000000, 'pay', 1000, 2000, 500, 'score', 1.2000000),
  ('GA7P7K6ULQ2KH3S6PFI2FCRU5PQDZGIAFDZYJGKZOMZQXE5IISCDW2YE', 'https://api.vespi.dev/v1/portfolio-scan', 'escrow', 60.0000000, 30.0000000, 'pay', 1000, 2000, 500, null, null)
on conflict (seller, resource_url) do nothing;

-- 8c. Principals and the agents that sign for them, so /principal has more than one account to show.
insert into agents (address, principal, label) values
  ('GAMBALAOPK6KSU5VQP3AOL3FEIYGM7OGPAIQYHMBDIZF3T2UCBDPTRYX', 'GDDNL2G3DXPUSQOEGDJNRLMUWQ6WVZQ56673MTONLMPZYD74QYBK5UNQ', 'Forecast Backfill Agent'),
  ('GB6SZZGATQAZYHEHBJE3PI6WE6ZYNZEGUHJUD3VMBPXAE3ZZRJDXSCY7', 'GDDNL2G3DXPUSQOEGDJNRLMUWQ6WVZQ56673MTONLMPZYD74QYBK5UNQ', 'Reference Librarian Agent'),
  ('GDRHJMT3P3NTTZLKXKB2ZECASGIONRSB5U77NJWKG7E3JSRPWCWQYVFO', 'GAMFEEMEXZD5SO7W7ELG5J6JNHNPOC53B7JLYTSBHOU2YPKO7IRRRPFF', 'Roadbook Agent'),
  ('GDP3RZSJT5I66VV7VTBHZJ7P4O5RWFMKNUY2VF6AB6DKKUS4ZCNKI6BI', 'GAMFEEMEXZD5SO7W7ELG5J6JNHNPOC53B7JLYTSBHOU2YPKO7IRRRPFF', 'Invoice Reconciler Agent'),
  ('GBANGNWBIVQFVRNM4EM3J4D4PJLDP5A6HZVK4CXMHLTN36QAVBLE4YNO', 'GBHQJM6IZL5PNAJHRTFNDMO3NS5E26VPXKZBRL6MMY4HUX4MLVMTWFYH', 'Itinerary Agent')
on conflict (address) do nothing;

-- 8d. Budgets. Explicit ids so re-applying the seed cannot double-insert (budgets has no unique key).
insert into budgets (id, agent, amount, asset, status, gate, funding_tx, created_at, expires_at) values
  (101, 'GAMBALAOPK6KSU5VQP3AOL3FEIYGM7OGPAIQYHMBDIZF3T2UCBDPTRYX', 100.0000000, 'USDC', 'funded', 'manual', 'c6a0a5a1282715b283b959711c693ba8523267a994e2d577f58658348604686c', now() - interval '160 hours', now() + interval '45 days'),
  (102, 'GB6SZZGATQAZYHEHBJE3PI6WE6ZYNZEGUHJUD3VMBPXAE3ZZRJDXSCY7', 250.0000000, 'USDC', 'funded', 'vespi', '128022d210f8ace34689e1e5d9ab99936c69860359e84b47edb3095424d0e04d', now() - interval '148 hours', now() + interval '30 days'),
  (103, 'GB6SZZGATQAZYHEHBJE3PI6WE6ZYNZEGUHJUD3VMBPXAE3ZZRJDXSCY7', 10.0000000, 'USDC', 'expired', 'manual', null, now() - interval '136 hours', now() - interval '6 days'),
  (104, 'GDRHJMT3P3NTTZLKXKB2ZECASGIONRSB5U77NJWKG7E3JSRPWCWQYVFO', 500.0000000, 'USDC', 'funded', 'manual', '2108a9ac7953f6dc98b4894bb1aaf91dec749b461bd93fc7df4a7a2dbcf572f3', now() - interval '124 hours', now() + interval '60 days'),
  (105, 'GDP3RZSJT5I66VV7VTBHZJ7P4O5RWFMKNUY2VF6AB6DKKUS4ZCNKI6BI', 75.0000000, 'USDC', 'approved', 'manual', null, now() - interval '112 hours', now() + interval '20 days'),
  (106, 'GDP3RZSJT5I66VV7VTBHZJ7P4O5RWFMKNUY2VF6AB6DKKUS4ZCNKI6BI', 400.0000000, 'USDC', 'pending', 'vespi', null, now() - interval '100 hours', now() + interval '90 days'),
  (107, 'GBANGNWBIVQFVRNM4EM3J4D4PJLDP5A6HZVK4CXMHLTN36QAVBLE4YNO', 1000.0000000, 'USDC', 'funded', 'vespi', 'a3be7c6e1a6556fc09a72f6ea49190fb8e9ad4a02664cca99bb9431c6a33318d', now() - interval '88 hours', now() + interval '120 days')
on conflict (id) do nothing;
select setval(pg_get_serial_sequence('budgets', 'id'), (select max(id) from budgets));

-- 8e. Pacts. One row per demo purchase; the state column is what the pages stamp on the card.
insert into pacts (pact_id, mode, buyer, seller, resource_url, cap, condition_hash, condition, metered,
                   silence, state, verdict_deadline, settle_deadline, to_seller, to_buyer, created_at, updated_at) values
  -- weather-alerts-denied: denied, 4.0000000 USDC, escrow
  ('3944c3351dd94616d2d2e02800a6789e79c16d1d64c406b8823cf103d0c1b250', 'escrow', 'GB6SZZGATQAZYHEHBJE3PI6WE6ZYNZEGUHJUD3VMBPXAE3ZZRJDXSCY7', 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5', 'https://api.pollar.dev/data/severe-weather-alerts', 4.0000000, '1e857d3e5607ed4de2fcd21f362fa12fa92eb064cce47b3c4c3c342812d2a2a2',
   '{"type":"http-match","method":"GET","status":200,"jsonpath":"$.alerts[0].id","max_age_seconds":900}'::jsonb, false, 'refund', 'denied', 52398100, 52399100, 0.0000000, 0.0000000,
   now() - interval '3 hours', now() - interval '3 hours'),
  -- weather-forecast-24h-settled: settled, 12.0000000 USDC, escrow
  ('b3e2cdf64c4ca1e2b060fecc7e63959f68bf373da1dbb92e18114686aaea1967', 'escrow', 'GAMBALAOPK6KSU5VQP3AOL3FEIYGM7OGPAIQYHMBDIZF3T2UCBDPTRYX', 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5', 'https://api.pollar.dev/data/forecast/24h', 12.0000000, 'af03621e21d8841c55d9e4dc8f48ba1cd140af8fbd9a174ece2e1f8ec6e14741',
   '{"type":"http-match","method":"GET","status":200,"jsonpath":"$.hours[*].temperature_c","min_items":24}'::jsonb, false, 'refund', 'settled', 52395700, 52396700, 12.0000000, 0.0000000,
   now() - interval '6 hours', now() - interval '6 hours'),
  -- weather-climate-historical-funded: funded, 25.0000000 USDC, escrow
  ('15d0df2116b8214d573471de4ea4ece49f8b98c327c471165a3f2c4d643d4736', 'escrow', 'GAMBALAOPK6KSU5VQP3AOL3FEIYGM7OGPAIQYHMBDIZF3T2UCBDPTRYX', 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5', 'https://api.pollar.dev/data/climate-historical', 25.0000000, '79e428ca6d61f551a0941b00d6ad15bea1ddc2ac38d88565d0d8c3578b3f3bf3',
   '{"type":"http-match","method":"GET","status":200,"jsonpath":"$.stations[*].annual_mean_c","min_items":40}'::jsonb, false, 'refund', 'funded', 52392200, 52393200, 0.0000000, 0.0000000,
   now() - interval '11 hours', now() - interval '11 hours'),
  -- papers-embed-paid: paid, 2.0000000 USDC, exact-refund (a payment has no receipt yet: the indexer mints one only on settle, release or refund)
  ('3e64ada3a7d1eabe7f39ca324efb5c5836cbd75ad6bc3c69fce3df2186e86e53', 'exact-refund', 'GDRHJMT3P3NTTZLKXKB2ZECASGIONRSB5U77NJWKG7E3JSRPWCWQYVFO', 'GCZR7V2EBPFQXS644CC35K5ACOBBKGGKMRS46DZ7ACTH37THRUHLOFKS', 'https://api.northstar.dev/v2/abstracts/embed', 2.0000000, 'ab9ea12d93d1a2d3ecb10f592a04545bcc60e0fff39fd65f4939bd91124c101f',
   '{"type":"hash-preimage"}'::jsonb, false, 'refund', 'paid', 52384500, 52385500, 2.0000000, 0.0000000,
   now() - interval '20 hours', now() - interval '20 hours'),
  -- risk-monitor-allowed: allowed, 40.0000000 USDC, escrow (verdict arrived, settle has not landed yet)
  ('e2c1ff3edb649ade33d41cedf9e7bc91dacbcdf1598d456b770b78393829283c', 'escrow', 'GB6SZZGATQAZYHEHBJE3PI6WE6ZYNZEGUHJUD3VMBPXAE3ZZRJDXSCY7', 'GA7P7K6ULQ2KH3S6PFI2FCRU5PQDZGIAFDZYJGKZOMZQXE5IISCDW2YE', 'https://api.vespi.dev/v1/monitor-subscribe', 40.0000000, '3ab3bd5ac9e7652d15f329068c9c08d1dfd0e8ce60e60ab816801299d22ad966',
   '{"type":"http-match","method":"POST","status":202,"jsonpath":"$.watch_id"}'::jsonb, false, 'pay', 'allowed', 52378900, 52379900, 0.0000000, 0.0000000,
   now() - interval '26 hours', now() - interval '26 hours'),
  -- static-map-refunded: refunded, 5.0000000 USDC, exact-refund
  ('1afb3d9ca91738fde609e0d5a6922f784e936eed357ff0bcdc5a43f77869b2a6', 'exact-refund', 'GDP3RZSJT5I66VV7VTBHZJ7P4O5RWFMKNUY2VF6AB6DKKUS4ZCNKI6BI', 'GAX7LQRK4SSPHEVPKPUHONJRROE3H65DHIUAK3323464H6QOOZSPFBMD', 'https://api.cartageo.dev/v1/static-map', 5.0000000, 'd3f6fb233f1d54aedb345b864773518d7bac629ca5dba85525583dd859b1da65',
   '{"type":"timeout"}'::jsonb, false, 'refund', 'refunded', 52389300, 52390300, 0.0000000, 5.0000000,
   now() - interval '14 hours', now() - interval '14 hours'),
  -- papers-citations-funded: funded, 6.0000000 USDC, exact-refund
  ('36dc2c4f95b92777453660662ca792f16e86e7b6e4d72a4bd3e8f0cd4969d4a7', 'exact-refund', 'GBANGNWBIVQFVRNM4EM3J4D4PJLDP5A6HZVK4CXMHLTN36QAVBLE4YNO', 'GCZR7V2EBPFQXS644CC35K5ACOBBKGGKMRS46DZ7ACTH37THRUHLOFKS', 'https://api.northstar.dev/v2/papers/citations', 6.0000000, 'ab9ea12d93d1a2d3ecb10f592a04545bcc60e0fff39fd65f4939bd91124c101f',
   '{"type":"hash-preimage"}'::jsonb, false, 'refund', 'funded', 52369300, 52370300, 0.0000000, 0.0000000,
   now() - interval '38 hours', now() - interval '38 hours'),
  -- weather-hourly-released: released, 3.5000000 USDC, escrow (allowed, but the seller never called settle before the deadline, so the cap went back)
  ('b0dbfc38fa8c3dd6f6a5295e4f00a871aaa4905eb169cd0917e5ca71c2a4aec7', 'escrow', 'GDRHJMT3P3NTTZLKXKB2ZECASGIONRSB5U77NJWKG7E3JSRPWCWQYVFO', 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5', 'https://api.pollar.dev/data/hourly-backfill', 3.5000000, 'af82ce07de1006828d1b30f53461e1b979689335b6c9d34072ec9c95d8bac2fb',
   '{"type":"http-match","method":"GET","status":200,"jsonpath":"$.rows[*].iso","min_items":720}'::jsonb, false, 'pay', 'released', 52375700, 52376700, 0.0000000, 3.5000000,
   now() - interval '30 hours', now() - interval '30 hours'),
  -- papers-search-metered-settled: settled, 15.0000000 USDC, escrow (3900 requests at 0.0025 each, so 9.75 of the 15.00 cap was owed and the rest came back)
  ('83573f10f7106c81ab0eb0c286cc1257321ac27e98e83ec422ebab00ca4fe3dd', 'escrow', 'GBANGNWBIVQFVRNM4EM3J4D4PJLDP5A6HZVK4CXMHLTN36QAVBLE4YNO', 'GCZR7V2EBPFQXS644CC35K5ACOBBKGGKMRS46DZ7ACTH37THRUHLOFKS', 'https://api.northstar.dev/v2/papers/search', 15.0000000, 'a6b92337241142ac91ad3540bbfc6ce611937791c96365268fd8a93a549aeb3d',
   '{"type":"metered-usage","unit":"request","unit_price":"0.0025000","cap":"15.0000000"}'::jsonb, true, 'pay', 'settled', 52364500, 52365500, 9.7500000, 5.2500000,
   now() - interval '44 hours', now() - interval '44 hours'),
  -- papers-fulltext-settled: settled, 8.0000000 USDC, escrow
  ('f3ce7cde59e5f5c5df9f44c5d299cd2550a1ad6478a98f5ba3e013971cba5b31', 'escrow', 'GAMBALAOPK6KSU5VQP3AOL3FEIYGM7OGPAIQYHMBDIZF3T2UCBDPTRYX', 'GCZR7V2EBPFQXS644CC35K5ACOBBKGGKMRS46DZ7ACTH37THRUHLOFKS', 'https://api.northstar.dev/v2/papers/fulltext', 8.0000000, '9a12cb2bc0196360c4ae755e387dac6db04892f040d515d0e647b07486c92ecb',
   '{"type":"hash-preimage","algorithm":"sha256","items":12}'::jsonb, false, 'refund', 'settled', 52357300, 52358300, 8.0000000, 0.0000000,
   now() - interval '52 hours', now() - interval '52 hours'),
  -- papers-citations-denied: denied, 6.0000000 USDC, escrow
  ('1c78d04042f3f8680dce12a0730f1fc18d302417fbaf33e016930cc24138bff6', 'escrow', 'GDP3RZSJT5I66VV7VTBHZJ7P4O5RWFMKNUY2VF6AB6DKKUS4ZCNKI6BI', 'GCZR7V2EBPFQXS644CC35K5ACOBBKGGKMRS46DZ7ACTH37THRUHLOFKS', 'https://api.northstar.dev/v2/papers/citations', 6.0000000, 'a7b969bd32b5e7fe66e4d150f6dba892fe3ac1be7ddad369782714a6132cec03',
   '{"type":"http-match","method":"GET","status":200,"jsonpath":"$.edges[*].to","min_items":500}'::jsonb, false, 'refund', 'denied', 52350900, 52351900, 0.0000000, 0.0000000,
   now() - interval '60 hours', now() - interval '60 hours'),
  -- papers-preprints-funded: funded, 1.5000000 USDC, exact-refund
  ('41e5f2acb086dccc2135a6098999f6b74d6249682a22a898491dc5181a4f19f5', 'exact-refund', 'GDRHJMT3P3NTTZLKXKB2ZECASGIONRSB5U77NJWKG7E3JSRPWCWQYVFO', 'GCZR7V2EBPFQXS644CC35K5ACOBBKGGKMRS46DZ7ACTH37THRUHLOFKS', 'https://api.northstar.dev/v2/preprints/search', 1.5000000, 'ab9ea12d93d1a2d3ecb10f592a04545bcc60e0fff39fd65f4939bd91124c101f',
   '{"type":"hash-preimage"}'::jsonb, false, 'refund', 'funded', 52344500, 52345500, 0.0000000, 0.0000000,
   now() - interval '68 hours', now() - interval '68 hours'),
  -- geocode-batch-refunded: refunded, 0.2500000 USDC, exact-refund
  ('522756775e87f3ecc1cd67b7e7c747f6ff3b209433132c21f2990c5f12e4021a', 'exact-refund', 'GDP3RZSJT5I66VV7VTBHZJ7P4O5RWFMKNUY2VF6AB6DKKUS4ZCNKI6BI', 'GAX7LQRK4SSPHEVPKPUHONJRROE3H65DHIUAK3323464H6QOOZSPFBMD', 'https://api.cartageo.dev/v1/geocode/batch', 0.2500000, 'd3f6fb233f1d54aedb345b864773518d7bac629ca5dba85525583dd859b1da65',
   '{"type":"timeout"}'::jsonb, false, 'refund', 'refunded', 52337300, 52338300, 0.0000000, 0.2500000,
   now() - interval '76 hours', now() - interval '76 hours'),
  -- reverse-geocode-settled: settled, 0.4000000 USDC, escrow
  ('a0bf310bfda04c24105287d4dcd0833b69cc6a70bf19eb3851274743b4119942', 'escrow', 'GB6SZZGATQAZYHEHBJE3PI6WE6ZYNZEGUHJUD3VMBPXAE3ZZRJDXSCY7', 'GAX7LQRK4SSPHEVPKPUHONJRROE3H65DHIUAK3323464H6QOOZSPFBMD', 'https://api.cartageo.dev/v1/reverse-geocode', 0.4000000, '13955e94a03d584ca2a1109be4d96fb9e1a620c65f5867ba245a7bbd1727f47f',
   '{"type":"http-match","method":"POST","status":200,"jsonpath":"$.results[*].address","min_items":200}'::jsonb, false, 'refund', 'settled', 52326100, 52327100, 0.4000000, 0.0000000,
   now() - interval '90 hours', now() - interval '90 hours'),
  -- maps-matrix-allowed: allowed, 18.0000000 USDC, escrow
  ('04f78faa4ab2476b234257f3a26de36344e012ae8b3585678eec39de485d29b0', 'escrow', 'GDP3RZSJT5I66VV7VTBHZJ7P4O5RWFMKNUY2VF6AB6DKKUS4ZCNKI6BI', 'GAX7LQRK4SSPHEVPKPUHONJRROE3H65DHIUAK3323464H6QOOZSPFBMD', 'https://api.cartageo.dev/v1/distance-matrix', 18.0000000, '39c852ec819fb1e4f90f2050244a7a80df18cfe58c804a3705a6a7681e1248b1',
   '{"type":"http-match","method":"POST","status":200,"jsonpath":"$.distances[*][*]","rows":40}'::jsonb, false, 'pay', 'allowed', 52317300, 52318300, 0.0000000, 0.0000000,
   now() - interval '100 hours', now() - interval '100 hours'),
  -- risk-score-settled: settled, 120.0000000 USDC, escrow
  ('203003e0080e9ae4fe21e8965a7e055b48a014f048df3d2c4d10375b44417973', 'escrow', 'GBANGNWBIVQFVRNM4EM3J4D4PJLDP5A6HZVK4CXMHLTN36QAVBLE4YNO', 'GA7P7K6ULQ2KH3S6PFI2FCRU5PQDZGIAFDZYJGKZOMZQXE5IISCDW2YE', 'https://api.vespi.dev/v1/risk-score', 120.0000000, '84b26e064c37be1add6298410e2a557e65bac2451a1b75d76669d534ca51d820',
   '{"type":"hash-preimage","algorithm":"sha256","fields":["score","model_version"]}'::jsonb, false, 'pay', 'settled', 52301000, 52302000, 120.0000000, 0.0000000,
   now() - interval '120 hours', now() - interval '120 hours'),
  -- risk-portfolio-released: released, 60.0000000 USDC, escrow (no verdict ever arrived, so silence=refund released the escrow)
  ('364e52a4677d08f41f9ccbe4c0772adf2b2fdee44fea2d8b6f634646cd176dd3', 'escrow', 'GB6SZZGATQAZYHEHBJE3PI6WE6ZYNZEGUHJUD3VMBPXAE3ZZRJDXSCY7', 'GA7P7K6ULQ2KH3S6PFI2FCRU5PQDZGIAFDZYJGKZOMZQXE5IISCDW2YE', 'https://api.vespi.dev/v1/portfolio-scan', 60.0000000, 'f9a433fd528f7fe18d049fb1733f749116a5a19fb7d6241312e0cd071b111b49',
   '{"type":"http-match","method":"POST","status":200,"jsonpath":"$.positions[*].isin","min_items":25}'::jsonb, false, 'refund', 'released', 52285000, 52286000, 0.0000000, 60.0000000,
   now() - interval '140 hours', now() - interval '140 hours')
on conflict (pact_id) do nothing;

-- 8f. The timelines. Amounts inside `data` are stroops, exactly as the contract emits them, which is
--     what lib/format.ts turns into the sentence on each block.
insert into pact_events (pact_id, stage, tx_hash, ledger, data) values
  ('3944c3351dd94616d2d2e02800a6789e79c16d1d64c406b8823cf103d0c1b250', 'opened', '3acd161872d4fcd8597afe186179a793f88eb0b6e85fe0f0a2a594d3028988a3', 52397600, '{"pact_id":"3944c3351dd94616d2d2e02800a6789e79c16d1d64c406b8823cf103d0c1b250","buyer":"GB6SZZGATQAZYHEHBJE3PI6WE6ZYNZEGUHJUD3VMBPXAE3ZZRJDXSCY7","seller":"GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5","cap":"40000000","condition_hash":"1e857d3e5607ed4de2fcd21f362fa12fa92eb064cce47b3c4c3c342812d2a2a2","metered":false,"silence":1,"verdict_deadline":52398100,"settle_deadline":52399100}'::jsonb),
  ('3944c3351dd94616d2d2e02800a6789e79c16d1d64c406b8823cf103d0c1b250', 'verdict', '56b69bc40fc6a5de8997af0c200340822e40efeca5af44b5b5d3a82112962aa7', 52397720, '{"pact_id":"3944c3351dd94616d2d2e02800a6789e79c16d1d64c406b8823cf103d0c1b250","verdict":0,"amount":"0","envelope_hash":"d986b68f2bca93c0e879037c521b56cd1515d4e1f463d954d61f25652ab02b39"}'::jsonb),
  ('b3e2cdf64c4ca1e2b060fecc7e63959f68bf373da1dbb92e18114686aaea1967', 'opened', 'efb46575a6b9a1dee671b9a738a737aadb03c14b31bcc3b3ba5d7baf02b1824b', 52395200, '{"pact_id":"b3e2cdf64c4ca1e2b060fecc7e63959f68bf373da1dbb92e18114686aaea1967","buyer":"GAMBALAOPK6KSU5VQP3AOL3FEIYGM7OGPAIQYHMBDIZF3T2UCBDPTRYX","seller":"GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5","cap":"120000000","condition_hash":"af03621e21d8841c55d9e4dc8f48ba1cd140af8fbd9a174ece2e1f8ec6e14741","metered":false,"silence":1,"verdict_deadline":52395700,"settle_deadline":52396700}'::jsonb),
  ('b3e2cdf64c4ca1e2b060fecc7e63959f68bf373da1dbb92e18114686aaea1967', 'verdict', 'babc0b7f6dac8588e69582dd80372e3e34edfaf5f884a5c539a645a466c1f935', 52395320, '{"pact_id":"b3e2cdf64c4ca1e2b060fecc7e63959f68bf373da1dbb92e18114686aaea1967","verdict":1,"amount":"120000000","envelope_hash":"d8621e5c1f07669c7951a48855110654207023299a00e667b312d58293084f0b"}'::jsonb),
  ('b3e2cdf64c4ca1e2b060fecc7e63959f68bf373da1dbb92e18114686aaea1967', 'settled', '2ccf49ce60df61231d5a0ffdfc14edd32182706b5bb64c8e2f5f6558bab4a2f0', 52395400, '{"pact_id":"b3e2cdf64c4ca1e2b060fecc7e63959f68bf373da1dbb92e18114686aaea1967","to_seller":"120000000","to_buyer":"0"}'::jsonb),
  ('15d0df2116b8214d573471de4ea4ece49f8b98c327c471165a3f2c4d643d4736', 'opened', 'dd9153043d2abfc1773aaaed385d75619607b2f007c438599ff45af8949aa196', 52391200, '{"pact_id":"15d0df2116b8214d573471de4ea4ece49f8b98c327c471165a3f2c4d643d4736","buyer":"GAMBALAOPK6KSU5VQP3AOL3FEIYGM7OGPAIQYHMBDIZF3T2UCBDPTRYX","seller":"GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5","cap":"250000000","condition_hash":"79e428ca6d61f551a0941b00d6ad15bea1ddc2ac38d88565d0d8c3578b3f3bf3","metered":false,"silence":1,"verdict_deadline":52392200,"settle_deadline":52393200}'::jsonb),
  ('3e64ada3a7d1eabe7f39ca324efb5c5836cbd75ad6bc3c69fce3df2186e86e53', 'opened', '6c89b82a346c394cb8dd80341bbffa8c9cdbb8ac9f419ef1d647d08c8c5a4b29', 52384000, '{"pact_id":"3e64ada3a7d1eabe7f39ca324efb5c5836cbd75ad6bc3c69fce3df2186e86e53","buyer":"GDRHJMT3P3NTTZLKXKB2ZECASGIONRSB5U77NJWKG7E3JSRPWCWQYVFO","seller":"GCZR7V2EBPFQXS644CC35K5ACOBBKGGKMRS46DZ7ACTH37THRUHLOFKS","cap":"20000000","condition_hash":"ab9ea12d93d1a2d3ecb10f592a04545bcc60e0fff39fd65f4939bd91124c101f","metered":false,"silence":1,"verdict_deadline":52384500,"settle_deadline":52385500}'::jsonb),
  ('3e64ada3a7d1eabe7f39ca324efb5c5836cbd75ad6bc3c69fce3df2186e86e53', 'paid', '8dc29de637248ae40283d8dd3aa2e1ae5e7fd6ef6a36d2a483ef6f5aa5218e2c', 52384040, '{"amount":"20000000","ledger":52384040,"recipient":"GCZR7V2EBPFQXS644CC35K5ACOBBKGGKMRS46DZ7ACTH37THRUHLOFKS","vault":"CAZZQ34EXD32AKLL25XS5OKOHTUU426VSE3FAT3LLLKKVQINWQDHB2FT"}'::jsonb),
  ('e2c1ff3edb649ade33d41cedf9e7bc91dacbcdf1598d456b770b78393829283c', 'opened', 'f61eef3585531c476b2e3d9085f82f4e1ca3673bd498258e120d742c998301ed', 52378400, '{"pact_id":"e2c1ff3edb649ade33d41cedf9e7bc91dacbcdf1598d456b770b78393829283c","buyer":"GB6SZZGATQAZYHEHBJE3PI6WE6ZYNZEGUHJUD3VMBPXAE3ZZRJDXSCY7","seller":"GA7P7K6ULQ2KH3S6PFI2FCRU5PQDZGIAFDZYJGKZOMZQXE5IISCDW2YE","cap":"400000000","condition_hash":"3ab3bd5ac9e7652d15f329068c9c08d1dfd0e8ce60e60ab816801299d22ad966","metered":false,"silence":2,"verdict_deadline":52378900,"settle_deadline":52379900}'::jsonb),
  ('e2c1ff3edb649ade33d41cedf9e7bc91dacbcdf1598d456b770b78393829283c', 'verdict', 'af4bef0c9cee8f9c602b4d19f92d4f3e413b51b8aef7bc0f0512c22e16b034b2', 52378520, '{"pact_id":"e2c1ff3edb649ade33d41cedf9e7bc91dacbcdf1598d456b770b78393829283c","verdict":1,"amount":"400000000","envelope_hash":"730b9469514d4e130074db4e39bb2f561655422e7447c6a10083b518b4813ff4"}'::jsonb),
  ('1afb3d9ca91738fde609e0d5a6922f784e936eed357ff0bcdc5a43f77869b2a6', 'opened', 'fb403b148f2699806633157ef0872eef67977e1c6aeaec0d414a875fdc77d89a', 52388800, '{"pact_id":"1afb3d9ca91738fde609e0d5a6922f784e936eed357ff0bcdc5a43f77869b2a6","buyer":"GDP3RZSJT5I66VV7VTBHZJ7P4O5RWFMKNUY2VF6AB6DKKUS4ZCNKI6BI","seller":"GAX7LQRK4SSPHEVPKPUHONJRROE3H65DHIUAK3323464H6QOOZSPFBMD","cap":"50000000","condition_hash":"d3f6fb233f1d54aedb345b864773518d7bac629ca5dba85525583dd859b1da65","metered":false,"silence":1,"verdict_deadline":52389300,"settle_deadline":52390300}'::jsonb),
  ('1afb3d9ca91738fde609e0d5a6922f784e936eed357ff0bcdc5a43f77869b2a6', 'refunded', 'ea42d1050845ced1dba263a39e1205287a1142bc06accd073b6dbf04b6da5e9e', 52388980, '{"amount":"50000000","ledger":52388980,"recipient":"GDP3RZSJT5I66VV7VTBHZJ7P4O5RWFMKNUY2VF6AB6DKKUS4ZCNKI6BI","vault":"CBQTFCDEPUA7TBRB2LB3M6WSCEAKNXLWYOEWEPSUS7RPZJP4UJIHJ2S4"}'::jsonb),
  ('36dc2c4f95b92777453660662ca792f16e86e7b6e4d72a4bd3e8f0cd4969d4a7', 'opened', '99fd7d5a2a6337ea3f7a922494399de4ae0f5e53a05f00afbd7675f9298024a2', 52368800, '{"pact_id":"36dc2c4f95b92777453660662ca792f16e86e7b6e4d72a4bd3e8f0cd4969d4a7","buyer":"GBANGNWBIVQFVRNM4EM3J4D4PJLDP5A6HZVK4CXMHLTN36QAVBLE4YNO","seller":"GCZR7V2EBPFQXS644CC35K5ACOBBKGGKMRS46DZ7ACTH37THRUHLOFKS","cap":"60000000","condition_hash":"ab9ea12d93d1a2d3ecb10f592a04545bcc60e0fff39fd65f4939bd91124c101f","metered":false,"silence":1,"verdict_deadline":52369300,"settle_deadline":52370300}'::jsonb),
  ('b0dbfc38fa8c3dd6f6a5295e4f00a871aaa4905eb169cd0917e5ca71c2a4aec7', 'opened', '6a5925094df111e999160561d73e553391801605405218eb78cb317f7340a3ba', 52375200, '{"pact_id":"b0dbfc38fa8c3dd6f6a5295e4f00a871aaa4905eb169cd0917e5ca71c2a4aec7","buyer":"GDRHJMT3P3NTTZLKXKB2ZECASGIONRSB5U77NJWKG7E3JSRPWCWQYVFO","seller":"GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5","cap":"35000000","condition_hash":"af82ce07de1006828d1b30f53461e1b979689335b6c9d34072ec9c95d8bac2fb","metered":false,"silence":2,"verdict_deadline":52375700,"settle_deadline":52376700}'::jsonb),
  ('b0dbfc38fa8c3dd6f6a5295e4f00a871aaa4905eb169cd0917e5ca71c2a4aec7', 'verdict', 'b73be97fb5dc26c54900f480bdd5cc21495a31fa4d2ac790837864594fe3661a', 52375320, '{"pact_id":"b0dbfc38fa8c3dd6f6a5295e4f00a871aaa4905eb169cd0917e5ca71c2a4aec7","verdict":1,"amount":"35000000","envelope_hash":"ce7d6bf03cd5a6f0d3c081e11ba7000658d3d92fb0bbaccb4bf4894740136226"}'::jsonb),
  ('b0dbfc38fa8c3dd6f6a5295e4f00a871aaa4905eb169cd0917e5ca71c2a4aec7', 'released', '0476d21e85851f8994d920cc0123e13c5f3588123038b7982c75e191e0fe0b36', 52375400, '{"pact_id":"b0dbfc38fa8c3dd6f6a5295e4f00a871aaa4905eb169cd0917e5ca71c2a4aec7","reason":3,"to_buyer":"35000000"}'::jsonb),
  ('83573f10f7106c81ab0eb0c286cc1257321ac27e98e83ec422ebab00ca4fe3dd', 'opened', '6f0e00616cc3f26688b909a320a4cea6e25350a9f58e627233e549e13bf0808e', 52364000, '{"pact_id":"83573f10f7106c81ab0eb0c286cc1257321ac27e98e83ec422ebab00ca4fe3dd","buyer":"GBANGNWBIVQFVRNM4EM3J4D4PJLDP5A6HZVK4CXMHLTN36QAVBLE4YNO","seller":"GCZR7V2EBPFQXS644CC35K5ACOBBKGGKMRS46DZ7ACTH37THRUHLOFKS","cap":"150000000","condition_hash":"a6b92337241142ac91ad3540bbfc6ce611937791c96365268fd8a93a549aeb3d","metered":true,"silence":2,"verdict_deadline":52364500,"settle_deadline":52365500}'::jsonb),
  ('83573f10f7106c81ab0eb0c286cc1257321ac27e98e83ec422ebab00ca4fe3dd', 'meter_closed', '1379b203c271eda3b616efbe9db1ed459ffb03a76ccc456843197da627786420', 52364070, '{"pact_id":"83573f10f7106c81ab0eb0c286cc1257321ac27e98e83ec422ebab00ca4fe3dd","units":"3900","to_seller":"97500000","to_buyer":"52500000"}'::jsonb),
  ('f3ce7cde59e5f5c5df9f44c5d299cd2550a1ad6478a98f5ba3e013971cba5b31', 'opened', '7e8a12dbbe2e2d35d6973f759649cbda61757e7be627141f77e282cfd51c8e75', 52356800, '{"pact_id":"f3ce7cde59e5f5c5df9f44c5d299cd2550a1ad6478a98f5ba3e013971cba5b31","buyer":"GAMBALAOPK6KSU5VQP3AOL3FEIYGM7OGPAIQYHMBDIZF3T2UCBDPTRYX","seller":"GCZR7V2EBPFQXS644CC35K5ACOBBKGGKMRS46DZ7ACTH37THRUHLOFKS","cap":"80000000","condition_hash":"9a12cb2bc0196360c4ae755e387dac6db04892f040d515d0e647b07486c92ecb","metered":false,"silence":1,"verdict_deadline":52357300,"settle_deadline":52358300}'::jsonb),
  ('f3ce7cde59e5f5c5df9f44c5d299cd2550a1ad6478a98f5ba3e013971cba5b31', 'verdict', '5c46dc265576eacef1225a76d6a139e6affe3e1dcbe03d2027c8bea0e350a725', 52356920, '{"pact_id":"f3ce7cde59e5f5c5df9f44c5d299cd2550a1ad6478a98f5ba3e013971cba5b31","verdict":1,"amount":"80000000","envelope_hash":"109b8783c4e4a1d5d4ed01c5cecfa4e3294a94cb1fd5630f549adbd3456b9f79"}'::jsonb),
  ('f3ce7cde59e5f5c5df9f44c5d299cd2550a1ad6478a98f5ba3e013971cba5b31', 'settled', '9ececa8260d6e55da60dfecf945069036a72b4c2607dc7722b234e3893ce8d5f', 52357000, '{"pact_id":"f3ce7cde59e5f5c5df9f44c5d299cd2550a1ad6478a98f5ba3e013971cba5b31","to_seller":"80000000","to_buyer":"0"}'::jsonb),
  ('1c78d04042f3f8680dce12a0730f1fc18d302417fbaf33e016930cc24138bff6', 'opened', '919162050b7ea1b648ee12ac3e4ea1669ba35e27b2db83978c1d0017c2477da5', 52350400, '{"pact_id":"1c78d04042f3f8680dce12a0730f1fc18d302417fbaf33e016930cc24138bff6","buyer":"GDP3RZSJT5I66VV7VTBHZJ7P4O5RWFMKNUY2VF6AB6DKKUS4ZCNKI6BI","seller":"GCZR7V2EBPFQXS644CC35K5ACOBBKGGKMRS46DZ7ACTH37THRUHLOFKS","cap":"60000000","condition_hash":"a7b969bd32b5e7fe66e4d150f6dba892fe3ac1be7ddad369782714a6132cec03","metered":false,"silence":1,"verdict_deadline":52350900,"settle_deadline":52351900}'::jsonb),
  ('1c78d04042f3f8680dce12a0730f1fc18d302417fbaf33e016930cc24138bff6', 'verdict', 'e9f1ef9236f81f1aa87b840f5623355a4cf8ef01988678a85356ea29538d65c8', 52350520, '{"pact_id":"1c78d04042f3f8680dce12a0730f1fc18d302417fbaf33e016930cc24138bff6","verdict":0,"amount":"0","envelope_hash":"c4e682faa16b3dab88bc9f3cf9ac9f7f6eae15f323ff7aeb380af9cb3eda2a1b"}'::jsonb),
  ('41e5f2acb086dccc2135a6098999f6b74d6249682a22a898491dc5181a4f19f5', 'opened', 'c0fe6a558138e8d472ebcff3d6f7e863f3790fcde7f016079c174d87084a0be2', 52344000, '{"pact_id":"41e5f2acb086dccc2135a6098999f6b74d6249682a22a898491dc5181a4f19f5","buyer":"GDRHJMT3P3NTTZLKXKB2ZECASGIONRSB5U77NJWKG7E3JSRPWCWQYVFO","seller":"GCZR7V2EBPFQXS644CC35K5ACOBBKGGKMRS46DZ7ACTH37THRUHLOFKS","cap":"15000000","condition_hash":"ab9ea12d93d1a2d3ecb10f592a04545bcc60e0fff39fd65f4939bd91124c101f","metered":false,"silence":1,"verdict_deadline":52344500,"settle_deadline":52345500}'::jsonb),
  ('522756775e87f3ecc1cd67b7e7c747f6ff3b209433132c21f2990c5f12e4021a', 'opened', 'afb63aab3e857eca110b009f7681fece880e13cde07cfb14824385dd1f197164', 52336800, '{"pact_id":"522756775e87f3ecc1cd67b7e7c747f6ff3b209433132c21f2990c5f12e4021a","buyer":"GDP3RZSJT5I66VV7VTBHZJ7P4O5RWFMKNUY2VF6AB6DKKUS4ZCNKI6BI","seller":"GAX7LQRK4SSPHEVPKPUHONJRROE3H65DHIUAK3323464H6QOOZSPFBMD","cap":"2500000","condition_hash":"d3f6fb233f1d54aedb345b864773518d7bac629ca5dba85525583dd859b1da65","metered":false,"silence":1,"verdict_deadline":52337300,"settle_deadline":52338300}'::jsonb),
  ('522756775e87f3ecc1cd67b7e7c747f6ff3b209433132c21f2990c5f12e4021a', 'refunded', 'ff10c05449721891c1f8feac3f8fe284ab2634347a0a82a10389a44a58c977e4', 52336980, '{"amount":"2500000","ledger":52336980,"recipient":"GDP3RZSJT5I66VV7VTBHZJ7P4O5RWFMKNUY2VF6AB6DKKUS4ZCNKI6BI","vault":"CBQTFCDEPUA7TBRB2LB3M6WSCEAKNXLWYOEWEPSUS7RPZJP4UJIHJ2S4"}'::jsonb),
  ('a0bf310bfda04c24105287d4dcd0833b69cc6a70bf19eb3851274743b4119942', 'opened', '9f88a1668255b035efffe8d03e8e12129b6f4cfc68930e3fc12bf200b30d1774', 52325600, '{"pact_id":"a0bf310bfda04c24105287d4dcd0833b69cc6a70bf19eb3851274743b4119942","buyer":"GB6SZZGATQAZYHEHBJE3PI6WE6ZYNZEGUHJUD3VMBPXAE3ZZRJDXSCY7","seller":"GAX7LQRK4SSPHEVPKPUHONJRROE3H65DHIUAK3323464H6QOOZSPFBMD","cap":"4000000","condition_hash":"13955e94a03d584ca2a1109be4d96fb9e1a620c65f5867ba245a7bbd1727f47f","metered":false,"silence":1,"verdict_deadline":52326100,"settle_deadline":52327100}'::jsonb),
  ('a0bf310bfda04c24105287d4dcd0833b69cc6a70bf19eb3851274743b4119942', 'verdict', 'c70dbb5a0c9756e9c16d6b6e9dfb4098357ab186b936ee6b8bcb1b1558627c67', 52325720, '{"pact_id":"a0bf310bfda04c24105287d4dcd0833b69cc6a70bf19eb3851274743b4119942","verdict":1,"amount":"4000000","envelope_hash":"8ec22e46acf2f091d573d6a09e9afde87b8ce6845cd568945f0222a5d9a45c09"}'::jsonb),
  ('a0bf310bfda04c24105287d4dcd0833b69cc6a70bf19eb3851274743b4119942', 'settled', '65f3acbf01e44fd3c3afa88e532c1ae28240f4f17483938ff4a3ca1bd766679e', 52325800, '{"pact_id":"a0bf310bfda04c24105287d4dcd0833b69cc6a70bf19eb3851274743b4119942","to_seller":"4000000","to_buyer":"0"}'::jsonb),
  ('04f78faa4ab2476b234257f3a26de36344e012ae8b3585678eec39de485d29b0', 'opened', 'b76a47e5841381a17acee161fe4b36e30389db2e01324a2e5b50cbfeef4f6a23', 52316800, '{"pact_id":"04f78faa4ab2476b234257f3a26de36344e012ae8b3585678eec39de485d29b0","buyer":"GDP3RZSJT5I66VV7VTBHZJ7P4O5RWFMKNUY2VF6AB6DKKUS4ZCNKI6BI","seller":"GAX7LQRK4SSPHEVPKPUHONJRROE3H65DHIUAK3323464H6QOOZSPFBMD","cap":"180000000","condition_hash":"39c852ec819fb1e4f90f2050244a7a80df18cfe58c804a3705a6a7681e1248b1","metered":false,"silence":2,"verdict_deadline":52317300,"settle_deadline":52318300}'::jsonb),
  ('04f78faa4ab2476b234257f3a26de36344e012ae8b3585678eec39de485d29b0', 'verdict', 'fb5e1551581df524d3373209b1f0e8804e9948e81c2069ba6b4272cc58f2a899', 52316920, '{"pact_id":"04f78faa4ab2476b234257f3a26de36344e012ae8b3585678eec39de485d29b0","verdict":1,"amount":"180000000","envelope_hash":"888cdcfd3f2e63deb61049fbd86b2af6ec8315079943c0bca2fd61b101efffd3"}'::jsonb),
  ('203003e0080e9ae4fe21e8965a7e055b48a014f048df3d2c4d10375b44417973', 'opened', '3ea4cc2b136aa4415be48a29d650b423665afb7f26a6034ba123386355ad898d', 52300000, '{"pact_id":"203003e0080e9ae4fe21e8965a7e055b48a014f048df3d2c4d10375b44417973","buyer":"GBANGNWBIVQFVRNM4EM3J4D4PJLDP5A6HZVK4CXMHLTN36QAVBLE4YNO","seller":"GA7P7K6ULQ2KH3S6PFI2FCRU5PQDZGIAFDZYJGKZOMZQXE5IISCDW2YE","cap":"1200000000","condition_hash":"84b26e064c37be1add6298410e2a557e65bac2451a1b75d76669d534ca51d820","metered":false,"silence":2,"verdict_deadline":52301000,"settle_deadline":52302000}'::jsonb),
  ('203003e0080e9ae4fe21e8965a7e055b48a014f048df3d2c4d10375b44417973', 'verdict', '82548d70a290bafb94499e66a87eba96374e33dee7b528bf1a5b1d7b4bf2f367', 52300120, '{"pact_id":"203003e0080e9ae4fe21e8965a7e055b48a014f048df3d2c4d10375b44417973","verdict":1,"amount":"1200000000","envelope_hash":"6cca8be7592b72da089ed364572416d9fd102b6e904f416ec69e2acc4e2aad90"}'::jsonb),
  ('203003e0080e9ae4fe21e8965a7e055b48a014f048df3d2c4d10375b44417973', 'settled', 'bef38c6cdc1c55761b7681b4e280b548d19369cbdb5c28c600b2e971b1afcd37', 52300200, '{"pact_id":"203003e0080e9ae4fe21e8965a7e055b48a014f048df3d2c4d10375b44417973","to_seller":"1200000000","to_buyer":"0"}'::jsonb),
  ('364e52a4677d08f41f9ccbe4c0772adf2b2fdee44fea2d8b6f634646cd176dd3', 'opened', '4178d5917771595e24c182d142004b1ae12e34f6be719c80c18256383cd29ecb', 52284000, '{"pact_id":"364e52a4677d08f41f9ccbe4c0772adf2b2fdee44fea2d8b6f634646cd176dd3","buyer":"GB6SZZGATQAZYHEHBJE3PI6WE6ZYNZEGUHJUD3VMBPXAE3ZZRJDXSCY7","seller":"GA7P7K6ULQ2KH3S6PFI2FCRU5PQDZGIAFDZYJGKZOMZQXE5IISCDW2YE","cap":"600000000","condition_hash":"f9a433fd528f7fe18d049fb1733f749116a5a19fb7d6241312e0cd071b111b49","metered":false,"silence":1,"verdict_deadline":52285000,"settle_deadline":52286000}'::jsonb),
  ('364e52a4677d08f41f9ccbe4c0772adf2b2fdee44fea2d8b6f634646cd176dd3', 'released', 'bc3a131832a38a0131a6d80042ad788c1e9d657941aec24e66a97795a6dfa141', 52284200, '{"pact_id":"364e52a4677d08f41f9ccbe4c0772adf2b2fdee44fea2d8b6f634646cd176dd3","reason":2,"to_buyer":"600000000"}'::jsonb)
on conflict (tx_hash, stage, pact_id) do nothing;

-- 8g. Verdict envelopes (Witness verdict-v1), one per pact the verifier answered.
insert into verdicts (envelope_hash, pact_id, milestone, verdict, amount, envelope, attested, created_at) values
  ('d986b68f2bca93c0e879037c521b56cd1515d4e1f463d954d61f25652ab02b39', '3944c3351dd94616d2d2e02800a6789e79c16d1d64c406b8823cf103d0c1b250', 'delivery', 'DENY', 0.0000000,
   '{"agreementId":"3944c3351dd94616d2d2e02800a6789e79c16d1d64c406b8823cf103d0c1b250","milestoneId":"delivery","verifier":"GDV7ITPLKAIRUGA4YMUM4YXS6FE47DYZYUNSZ46WA2X5VVVWCLZ6CCXY","verifierType":"automated_agent","criteria":[{"id":"c1","verifier":"GDV7ITPLKAIRUGA4YMUM4YXS6FE47DYZYUNSZ46WA2X5VVVWCLZ6CCXY","result":"FAIL","code":"STALE_BODY","reason":"The alert feed answered with a body older than the pact''s max_age.","mandatory":true}],"evidence":[{"id":"e1","kind":"http-response","sha256":"0c6965c40909280b39749afe956c4ec99d39b2952baeadd45b1281410b356627"}],"verdict":{"decision":"DENY","reasons":["STALE_BODY"],"policyVersion":"3"},"timestamp":"2026-11-01T00:00:00.000Z","conditionHash":"1e857d3e5607ed4de2fcd21f362fa12fa92eb064cce47b3c4c3c342812d2a2a2"}'::jsonb, true, now() - interval '2 hours'),
  ('d8621e5c1f07669c7951a48855110654207023299a00e667b312d58293084f0b', 'b3e2cdf64c4ca1e2b060fecc7e63959f68bf373da1dbb92e18114686aaea1967', 'delivery', 'ALLOW', 12.0000000,
   '{"agreementId":"b3e2cdf64c4ca1e2b060fecc7e63959f68bf373da1dbb92e18114686aaea1967","milestoneId":"delivery","verifier":"GDV7ITPLKAIRUGA4YMUM4YXS6FE47DYZYUNSZ46WA2X5VVVWCLZ6CCXY","verifierType":"automated_agent","criteria":[{"id":"c1","verifier":"GDV7ITPLKAIRUGA4YMUM4YXS6FE47DYZYUNSZ46WA2X5VVVWCLZ6CCXY","result":"PASS","code":"OK","reason":"24 hourly buckets returned, all with a temperature and a timestamp.","mandatory":true}],"evidence":[{"id":"e1","kind":"http-response","sha256":"683d6e5b44bd52b2028619d10882d351c1c997df1dc2ad512f7da6ef7e3b98a6"}],"verdict":{"decision":"ALLOW","reasons":["OK"],"policyVersion":"3"},"timestamp":"2026-11-01T00:00:00.000Z","conditionHash":"af03621e21d8841c55d9e4dc8f48ba1cd140af8fbd9a174ece2e1f8ec6e14741"}'::jsonb, true, now() - interval '5 hours'),
  ('730b9469514d4e130074db4e39bb2f561655422e7447c6a10083b518b4813ff4', 'e2c1ff3edb649ade33d41cedf9e7bc91dacbcdf1598d456b770b78393829283c', 'delivery', 'ALLOW', 40.0000000,
   '{"agreementId":"e2c1ff3edb649ade33d41cedf9e7bc91dacbcdf1598d456b770b78393829283c","milestoneId":"delivery","verifier":"GDV7ITPLKAIRUGA4YMUM4YXS6FE47DYZYUNSZ46WA2X5VVVWCLZ6CCXY","verifierType":"automated_agent","criteria":[{"id":"c1","verifier":"GDV7ITPLKAIRUGA4YMUM4YXS6FE47DYZYUNSZ46WA2X5VVVWCLZ6CCXY","result":"PASS","code":"OK","reason":"The watch list was accepted and the first scan ran inside the window.","mandatory":true}],"evidence":[{"id":"e1","kind":"http-response","sha256":"fb247c6430b869a57a518165fadd07ae00cd8b8b13101bcead172882cc7c78c6"}],"verdict":{"decision":"ALLOW","reasons":["OK"],"policyVersion":"3"},"timestamp":"2026-11-01T00:00:00.000Z","conditionHash":"3ab3bd5ac9e7652d15f329068c9c08d1dfd0e8ce60e60ab816801299d22ad966"}'::jsonb, true, now() - interval '25 hours'),
  ('ce7d6bf03cd5a6f0d3c081e11ba7000658d3d92fb0bbaccb4bf4894740136226', 'b0dbfc38fa8c3dd6f6a5295e4f00a871aaa4905eb169cd0917e5ca71c2a4aec7', 'delivery', 'ALLOW', 3.5000000,
   '{"agreementId":"b0dbfc38fa8c3dd6f6a5295e4f00a871aaa4905eb169cd0917e5ca71c2a4aec7","milestoneId":"delivery","verifier":"GDV7ITPLKAIRUGA4YMUM4YXS6FE47DYZYUNSZ46WA2X5VVVWCLZ6CCXY","verifierType":"automated_agent","criteria":[{"id":"c1","verifier":"GDV7ITPLKAIRUGA4YMUM4YXS6FE47DYZYUNSZ46WA2X5VVVWCLZ6CCXY","result":"PASS","code":"OK","reason":"720 hourly rows delivered against the buyer''s own window.","mandatory":true}],"evidence":[{"id":"e1","kind":"http-response","sha256":"073fbf9ed015a2065dc4ead1199b21debfa68bde1b0b2ed9c4f30dccde31bf7e"}],"verdict":{"decision":"ALLOW","reasons":["OK"],"policyVersion":"3"},"timestamp":"2026-11-01T00:00:00.000Z","conditionHash":"af82ce07de1006828d1b30f53461e1b979689335b6c9d34072ec9c95d8bac2fb"}'::jsonb, true, now() - interval '29 hours'),
  ('109b8783c4e4a1d5d4ed01c5cecfa4e3294a94cb1fd5630f549adbd3456b9f79', 'f3ce7cde59e5f5c5df9f44c5d299cd2550a1ad6478a98f5ba3e013971cba5b31', 'delivery', 'ALLOW', 8.0000000,
   '{"agreementId":"f3ce7cde59e5f5c5df9f44c5d299cd2550a1ad6478a98f5ba3e013971cba5b31","milestoneId":"delivery","verifier":"GDV7ITPLKAIRUGA4YMUM4YXS6FE47DYZYUNSZ46WA2X5VVVWCLZ6CCXY","verifierType":"automated_agent","criteria":[{"id":"c1","verifier":"GDV7ITPLKAIRUGA4YMUM4YXS6FE47DYZYUNSZ46WA2X5VVVWCLZ6CCXY","result":"PASS","code":"OK","reason":"12 PDFs returned, each with the DOI the buyer asked for.","mandatory":true}],"evidence":[{"id":"e1","kind":"http-response","sha256":"c4d43cb4f1311f6b0d69778045f4e6effa10bbf3dfcdc91aeec025ce30b88651"}],"verdict":{"decision":"ALLOW","reasons":["OK"],"policyVersion":"3"},"timestamp":"2026-11-01T00:00:00.000Z","conditionHash":"9a12cb2bc0196360c4ae755e387dac6db04892f040d515d0e647b07486c92ecb"}'::jsonb, true, now() - interval '51 hours'),
  ('c4e682faa16b3dab88bc9f3cf9ac9f7f6eae15f323ff7aeb380af9cb3eda2a1b', '1c78d04042f3f8680dce12a0730f1fc18d302417fbaf33e016930cc24138bff6', 'delivery', 'DENY', 0.0000000,
   '{"agreementId":"1c78d04042f3f8680dce12a0730f1fc18d302417fbaf33e016930cc24138bff6","milestoneId":"delivery","verifier":"GDV7ITPLKAIRUGA4YMUM4YXS6FE47DYZYUNSZ46WA2X5VVVWCLZ6CCXY","verifierType":"automated_agent","criteria":[{"id":"c1","verifier":"GDV7ITPLKAIRUGA4YMUM4YXS6FE47DYZYUNSZ46WA2X5VVVWCLZ6CCXY","result":"FAIL","code":"COUNT_SHORT","reason":"The citation list held 61 of the 500 edges the condition asked for.","mandatory":true}],"evidence":[{"id":"e1","kind":"http-response","sha256":"e824d68acd12a235f5b615a8ea1b4868df2601eda096d266657b4951bbc19e34"}],"verdict":{"decision":"DENY","reasons":["COUNT_SHORT"],"policyVersion":"3"},"timestamp":"2026-11-01T00:00:00.000Z","conditionHash":"a7b969bd32b5e7fe66e4d150f6dba892fe3ac1be7ddad369782714a6132cec03"}'::jsonb, true, now() - interval '59 hours'),
  ('8ec22e46acf2f091d573d6a09e9afde87b8ce6845cd568945f0222a5d9a45c09', 'a0bf310bfda04c24105287d4dcd0833b69cc6a70bf19eb3851274743b4119942', 'delivery', 'ALLOW', 0.4000000,
   '{"agreementId":"a0bf310bfda04c24105287d4dcd0833b69cc6a70bf19eb3851274743b4119942","milestoneId":"delivery","verifier":"GDV7ITPLKAIRUGA4YMUM4YXS6FE47DYZYUNSZ46WA2X5VVVWCLZ6CCXY","verifierType":"automated_agent","criteria":[{"id":"c1","verifier":"GDV7ITPLKAIRUGA4YMUM4YXS6FE47DYZYUNSZ46WA2X5VVVWCLZ6CCXY","result":"PASS","code":"OK","reason":"Each point resolved to a premise address inside 25 m.","mandatory":true}],"evidence":[{"id":"e1","kind":"http-response","sha256":"687fb3e95a1ab5744716da229f1b3a13aefcf58859f5589091ebf4b60a318532"}],"verdict":{"decision":"ALLOW","reasons":["OK"],"policyVersion":"3"},"timestamp":"2026-11-01T00:00:00.000Z","conditionHash":"13955e94a03d584ca2a1109be4d96fb9e1a620c65f5867ba245a7bbd1727f47f"}'::jsonb, true, now() - interval '89 hours'),
  ('888cdcfd3f2e63deb61049fbd86b2af6ec8315079943c0bca2fd61b101efffd3', '04f78faa4ab2476b234257f3a26de36344e012ae8b3585678eec39de485d29b0', 'delivery', 'ALLOW', 18.0000000,
   '{"agreementId":"04f78faa4ab2476b234257f3a26de36344e012ae8b3585678eec39de485d29b0","milestoneId":"delivery","verifier":"GDV7ITPLKAIRUGA4YMUM4YXS6FE47DYZYUNSZ46WA2X5VVVWCLZ6CCXY","verifierType":"automated_agent","criteria":[{"id":"c1","verifier":"GDV7ITPLKAIRUGA4YMUM4YXS6FE47DYZYUNSZ46WA2X5VVVWCLZ6CCXY","result":"PASS","code":"OK","reason":"A complete 40x40 matrix with travel times and distances.","mandatory":true}],"evidence":[{"id":"e1","kind":"http-response","sha256":"62a9811ac0ffab6473ca0f404c66104cfcd537442ebe8ee46f660bfb427b60ac"}],"verdict":{"decision":"ALLOW","reasons":["OK"],"policyVersion":"3"},"timestamp":"2026-11-01T00:00:00.000Z","conditionHash":"39c852ec819fb1e4f90f2050244a7a80df18cfe58c804a3705a6a7681e1248b1"}'::jsonb, true, now() - interval '99 hours'),
  ('6cca8be7592b72da089ed364572416d9fd102b6e904f416ec69e2acc4e2aad90', '203003e0080e9ae4fe21e8965a7e055b48a014f048df3d2c4d10375b44417973', 'delivery', 'ALLOW', 120.0000000,
   '{"agreementId":"203003e0080e9ae4fe21e8965a7e055b48a014f048df3d2c4d10375b44417973","milestoneId":"delivery","verifier":"GDV7ITPLKAIRUGA4YMUM4YXS6FE47DYZYUNSZ46WA2X5VVVWCLZ6CCXY","verifierType":"automated_agent","criteria":[{"id":"c1","verifier":"GDV7ITPLKAIRUGA4YMUM4YXS6FE47DYZYUNSZ46WA2X5VVVWCLZ6CCXY","result":"PASS","code":"OK","reason":"Score returned with the model version and every feature the pact named.","mandatory":true}],"evidence":[{"id":"e1","kind":"http-response","sha256":"62320f780b4212388faf3a8e781b2789c0cb622e88d12bbb126fdd4e7db2f429"}],"verdict":{"decision":"ALLOW","reasons":["OK"],"policyVersion":"3"},"timestamp":"2026-11-01T00:00:00.000Z","conditionHash":"84b26e064c37be1add6298410e2a557e65bac2451a1b75d76669d534ca51d820"}'::jsonb, true, now() - interval '119 hours')
on conflict (envelope_hash) do nothing;

-- 8h. Receipt batches. Roots are the sorted-pair Merkle root over the leaves of that batch, so the
--     proof stored on each receipt verifies against the root stored here.
insert into receipt_batches (batch_id, root, leaf_count, anchor_tx, anchored_at, anchored_ledger) values
  -- batch 2: 6 receipts — weather-forecast-24h-settled, weather-hourly-released, papers-fulltext-settled, reverse-geocode-settled, risk-score-settled, risk-portfolio-released
  (2, 'e0f874ea92bd2e6fb69500299d03923d0c1d54a592fd52373b41e4a826bf0928', 6, '9b47bd435d37b32544be843c921db61c9e6bf36a7434d2120bfe90d5443344a4', now() - interval '138 hours', 52395430),
  -- batch 3: 3 receipts — static-map-refunded, papers-search-metered-settled, geocode-batch-refunded
  (3, '54eef3f52bdfde7970f7396a454a857d7f6c3ffb14fca8b9159221695636892d', 3, '100b1fba98583b6ed93778d8eee8d56e6b36bae075e8e8e79ad6621b72cf450a', now() - interval '74 hours', 52389010)
on conflict (batch_id) do nothing;

-- 8i. The receipts themselves, with the leaf inputs so /verify can recompute the leaf it is shown.
insert into receipts (leaf, pact_id, transition, batch_id, proof, to_seller_stroops, to_buyer_stroops, envelope_hash, ledger) values
  ('b2d1f0e009b8015f363734b0d81c682a581a7d69bada9ae1bc78995f8538abef', 'b3e2cdf64c4ca1e2b060fecc7e63959f68bf373da1dbb92e18114686aaea1967', 'settled', 2, '["dd7e697150c765046831de7fb5c0d4daa72df09851196f673233d3d0fa447655","b852c1d51c0ce9b338c66bba1fcb8eae209cfed7ac39a1324b5d6236f1eaf349"]'::jsonb, 120000000, 0, 'd8621e5c1f07669c7951a48855110654207023299a00e667b312d58293084f0b', 52395400),
  ('dd7e697150c765046831de7fb5c0d4daa72df09851196f673233d3d0fa447655', 'b0dbfc38fa8c3dd6f6a5295e4f00a871aaa4905eb169cd0917e5ca71c2a4aec7', 'released', 2, '["b2d1f0e009b8015f363734b0d81c682a581a7d69bada9ae1bc78995f8538abef","b852c1d51c0ce9b338c66bba1fcb8eae209cfed7ac39a1324b5d6236f1eaf349"]'::jsonb, 0, 35000000, 'ce7d6bf03cd5a6f0d3c081e11ba7000658d3d92fb0bbaccb4bf4894740136226', 52375400),
  ('7909ed2ca66304b94d92e4efa006c88cfd2398a2576d8071a6fd06f8aa43ce18', 'f3ce7cde59e5f5c5df9f44c5d299cd2550a1ad6478a98f5ba3e013971cba5b31', 'settled', 2, '["8e6bd736f759f1365553521f9739e3880ee6aec4d2038ea10eac63acb822596d","2642f7abebbde1862f3282cc20f1dadbb40650d27f8d77ed923770956c83f4b2","7e28f93421918bc8c51616ba1c27a74c12ebc1e850bd772b9590306cedd60e68"]'::jsonb, 80000000, 0, '109b8783c4e4a1d5d4ed01c5cecfa4e3294a94cb1fd5630f549adbd3456b9f79', 52357000),
  ('0a52f93aa50aef6dc7d75e410bbcae7e2273febe64c68f6ce6c05efd044e9198', 'a0bf310bfda04c24105287d4dcd0833b69cc6a70bf19eb3851274743b4119942', 'settled', 2, '["24e23769d40dde9a7b512d8a71e1d6dd1ab9d0fd0b9a1def1cc6ec30bd298427","e22e075024135742624a9bdb327dd2e4724ce8e354ae26f3daf6ac835b4312c2","7e28f93421918bc8c51616ba1c27a74c12ebc1e850bd772b9590306cedd60e68"]'::jsonb, 4000000, 0, '8ec22e46acf2f091d573d6a09e9afde87b8ce6845cd568945f0222a5d9a45c09', 52325800),
  ('24e23769d40dde9a7b512d8a71e1d6dd1ab9d0fd0b9a1def1cc6ec30bd298427', '203003e0080e9ae4fe21e8965a7e055b48a014f048df3d2c4d10375b44417973', 'settled', 2, '["0a52f93aa50aef6dc7d75e410bbcae7e2273febe64c68f6ce6c05efd044e9198","e22e075024135742624a9bdb327dd2e4724ce8e354ae26f3daf6ac835b4312c2","7e28f93421918bc8c51616ba1c27a74c12ebc1e850bd772b9590306cedd60e68"]'::jsonb, 1200000000, 0, '6cca8be7592b72da089ed364572416d9fd102b6e904f416ec69e2acc4e2aad90', 52300200),
  ('8e6bd736f759f1365553521f9739e3880ee6aec4d2038ea10eac63acb822596d', '364e52a4677d08f41f9ccbe4c0772adf2b2fdee44fea2d8b6f634646cd176dd3', 'released', 2, '["7909ed2ca66304b94d92e4efa006c88cfd2398a2576d8071a6fd06f8aa43ce18","2642f7abebbde1862f3282cc20f1dadbb40650d27f8d77ed923770956c83f4b2","7e28f93421918bc8c51616ba1c27a74c12ebc1e850bd772b9590306cedd60e68"]'::jsonb, 0, 600000000, null, 52284200),
  ('34e0810a9076408b0d8ab3cf3342d0d2de43f757c17558ca3b6dc4063fdf0959', '1afb3d9ca91738fde609e0d5a6922f784e936eed357ff0bcdc5a43f77869b2a6', 'refunded', 3, '["bb48cac69ffac9ef9fe8cb1716a0e84c55c2de53a80abf9df12fb12c10e14f05","e3661b091065de1e72d1b9998229d6f99281c4c58a076190a0f9cf3cfca4adf1"]'::jsonb, 0, 50000000, null, 52388980),
  ('e3661b091065de1e72d1b9998229d6f99281c4c58a076190a0f9cf3cfca4adf1', '83573f10f7106c81ab0eb0c286cc1257321ac27e98e83ec422ebab00ca4fe3dd', 'settled', 3, '["bc0f9200002918043fb895633854b03d7c8e689b152c1366af5dffd4bf3792e8"]'::jsonb, 97500000, 52500000, null, 52364070),
  ('bb48cac69ffac9ef9fe8cb1716a0e84c55c2de53a80abf9df12fb12c10e14f05', '522756775e87f3ecc1cd67b7e7c747f6ff3b209433132c21f2990c5f12e4021a', 'refunded', 3, '["34e0810a9076408b0d8ab3cf3342d0d2de43f757c17558ca3b6dc4063fdf0959","e3661b091065de1e72d1b9998229d6f99281c4c58a076190a0f9cf3cfca4adf1"]'::jsonb, 0, 2500000, null, 52336980)
on conflict (leaf) do nothing;

