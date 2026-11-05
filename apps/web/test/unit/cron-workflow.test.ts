/**
 * #60: sync and anchor must not share a lock, and a sync run must not outlive the tick that made it.
 *
 * `.github/workflows/studio-cron.yml` had one job holding one `concurrency.group: studio-cron` with
 * `cancel-in-progress: false` and a 10-minute ceiling, and its curl could burn ~9 minutes of that on
 * retries. Measured over the 56 scheduled runs of the 6.74 days to 2026-11-05 that cost Studio no
 * cadence -- nothing was cancelled or skipped, and GitHub's own scheduler delivered only 8.3 of the 312
 * daily ticks -- but the shared lock kept an hourly anchor able to sit on the sync path, which is the
 * failure this file can actually control. These tests keep the two locks apart.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL("../../../../.github/workflows/studio-cron.yml", import.meta.url),
  "utf8"
);

/** The body of one job, taken by its indentation under `jobs:`. */
function jobBody(name: string): string {
  const start = new RegExp(`^  ${name}:$`, "m").exec(workflow);
  if (!start) return "";
  const rest = workflow.slice(start.index + start[0].length);
  const next = /^ {2}\S/m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

describe("#60 studio-cron drives sync and anchor independently", () => {
  it("has no job-level lock shared by the whole workflow", () => {
    // A `concurrency:` at column 0 applies to every job in the file, which is the thing that made
    // anchoring able to starve indexing.
    expect(workflow).not.toMatch(/^concurrency:/m);
    expect(workflow).not.toMatch(/^\s*group:\s*studio-cron\s*$/m);
  });

  it("gives each job its own group", () => {
    for (const job of ["sync", "anchor"]) {
      expect(jobBody(job), `job ${job} is missing`).toContain(`group: studio-cron-${job}`);
    }
    expect(jobBody("sync")).not.toContain("studio-cron-anchor");
    expect(jobBody("anchor")).not.toContain("studio-cron-sync");
  });

  it("bounds a sync run inside the tick that scheduled it", () => {
    const timeout = /^ {4}timeout-minutes:\s*(\d+)/m.exec(jobBody("sync"));
    expect(timeout, "the sync job has no timeout").not.toBeNull();
    // 5 minutes is the ask; anything at or above it can hold the lock across the next tick.
    expect(Number(timeout![1])).toBeLessThan(5);
  });

  it("anchors after the sync that feeds it, on the hourly tick only", () => {
    const anchor = jobBody("anchor");
    expect(anchor).toMatch(/^ {4}needs:\s*sync$/m);
    expect(anchor).toContain("if: always()");
    // `always()` is what keeps the backlog draining when the sync before it failed; the schedule test
    // is what keeps this off the 5-minute ticks, where there is nothing new to anchor.
    expect(anchor).toContain("'7 * * * *'");
  });

  it("calls both protected routes with the bearer secret and never echoes its value", () => {
    expect(jobBody("sync")).toContain('-H "Authorization: Bearer $CRON_SECRET" "$STUDIO_URL/api/sync"');
    expect(jobBody("anchor")).toContain('-H "Authorization: Bearer $CRON_SECRET" "$STUDIO_URL/api/anchor"');
    // Naming a missing variable in ::error:: is the point of the config check; printing what it holds
    // would put the token in a log anyone with Actions read can open.
    expect(workflow).not.toMatch(/echo[^\n]*\$\{?(CRON_SECRET|STUDIO_URL)\b/);
  });
});
