/**
 * #60: the indexer-lag alert has to come from the cadence that actually runs.
 *
 * `probeIndexerLag` used to default to 50% of RPC retention. On the deployed testnet window that is
 * 60480 ledgers, about 3.5 days, while the `studio-cron` ticks GitHub delivers arrive a median 3.02 h
 * apart and a worst 7.91 h apart -- so `GET /api/ops/health` answered `healthy: true` both at 5673
 * ledgers (~7.9 h) behind and at 12 ledgers, and the two looked the same. The shortfall the issue
 * reported was invisible by construction. These tests pin the replacement: a threshold derived from
 * the measured gap, loose enough not to cry wolf on a late tick, and nowhere near a 3.5-day blindfold.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  MAX_LAG_LEDGERS_FROM_CADENCE,
  MEASURED_MAX_SYNC_GAP_SECONDS,
  SECONDS_PER_LEDGER,
  probeIndexerLag,
} from "@/lib/ops/monitoring";

/** The RPC window the deployed testnet reports, from `getHealth`'s `ledgerRetentionWindow`. */
const TESTNET_RETENTION = 120960;
/** The lag `/api/ops/health` reported at 11:35Z on 2026-11-05 while still calling itself healthy. */
const LIVE_LAG_ON_2026_11_05 = 5673;

const hours = (ledgers: number) => (ledgers * SECONDS_PER_LEDGER) / 3600;

afterEach(() => {
  delete process.env.PROBE_MAX_INDEXER_LAG_LEDGERS;
  delete process.env.PROBE_MAX_INDEXER_LAG_SECONDS;
});

describe("#60 the lag alert is derived from the cadence that runs", () => {
  it("takes its default from the measured gap, not from half of retention", () => {
    const probe = probeIndexerLag(LIVE_LAG_ON_2026_11_05, TESTNET_RETENTION);

    expect(probe.threshold).toBe(MAX_LAG_LEDGERS_FROM_CADENCE);
    expect(probe.configSource).toBe(`default:cadence(${MAX_LAG_LEDGERS_FROM_CADENCE})`);
    // The number the old default produced. If this ever equals 60480 the blindfold is back.
    expect(Math.floor(TESTNET_RETENTION * 0.5)).toBe(60480);
  });

  it("is a derivation of the measurement, and lands between a late tick and a day", () => {
    expect(MAX_LAG_LEDGERS_FROM_CADENCE).toBe(
      Math.ceil((2 * MEASURED_MAX_SYNC_GAP_SECONDS) / SECONDS_PER_LEDGER)
    );
    // Above two worst-case late ticks (a sync 7.91h stale must not warn twice over), so it cannot be
    // noise; under a day, so a stopped indexer is visible the same working day it stopped.
    expect(hours(MAX_LAG_LEDGERS_FROM_CADENCE)).toBeGreaterThan(2 * (MEASURED_MAX_SYNC_GAP_SECONDS / 3600) - 0.1);
    expect(hours(MAX_LAG_LEDGERS_FROM_CADENCE)).toBeLessThan(24);
  });

  it("still passes the lag that was live when the issue was measured", () => {
    // Tightening the alert must not turn an ordinary cadence into a 503 on /api/ops/health.
    expect(probeIndexerLag(LIVE_LAG_ON_2026_11_05, TESTNET_RETENTION).ok).toBe(true);
  });

  it("warns on a cursor more than a day stale and says so in hours", () => {
    const stale = Math.round(26 * 3600) / SECONDS_PER_LEDGER; // 26h of ledgers
    const probe = probeIndexerLag(stale, TESTNET_RETENTION);

    expect(probe.ok).toBe(false);
    expect(probe.alert).toContain("cadence-derived threshold");
    expect(probe.alert).toContain("~26h");
  });

  it("keeps the retention half as the ceiling when the window is short", () => {
    // DEFAULT_RPC_RETENTION (~24h) halves to 8640 ledgers, below the cadence number: the old warning
    // still owns that case, because events go away at the end of the window.
    const probe = probeIndexerLag(9000, 17280);

    expect(probe.threshold).toBe(8640);
    expect(probe.configSource).toBe("default:50%retention(8640)");
    expect(probe.alert).toContain("WARNING: Indexer lag has exceeded 50% of retention");
  });

  it("lets an explicit override win over the derived default", () => {
    process.env.PROBE_MAX_INDEXER_LAG_LEDGERS = "5000";
    const probe = probeIndexerLag(6000, TESTNET_RETENTION);

    expect(probe.threshold).toBe(5000);
    expect(probe.configSource).toBe("env:PROBE_MAX_INDEXER_LAG_LEDGERS(5000)");
  });
});
