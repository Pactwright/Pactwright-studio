-- Append-only ops probe runs for history, duration tracking, and alert deduplication. ROADMAP XC-03, S-10, #47.

create table ops_probe_runs (
  id           bigserial primary key,
  signal       text not null,
  value        numeric,
  threshold    numeric,
  healthy      boolean not null,
  alert        text,
  recorded_at  timestamptz not null default now()
);

create index idx_ops_probe_runs_signal_recorded on ops_probe_runs(signal, recorded_at desc);
create index idx_ops_probe_runs_healthy_recorded on ops_probe_runs(healthy, recorded_at desc);
