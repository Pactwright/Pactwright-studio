/**
 * #61: one scheduler story, and the dead artifacts stay dead.
 *
 * Three files described infrastructure that was not running: a root `vercel.json` that scheduled
 * `/api/sync` every 5 minutes and `/api/anchor` on the hour, for a platform this app did not deploy
 * on, `apps/web/app/api/_lib/not-implemented.ts`, defined and called by nothing, and a `render.yaml`
 * that generated its own `CRON_SECRET` (`generateValue: true`) beside the repository secret the only
 * working caller actually uses. The root config went in `a1d0525` (2026-10-31) and `render.yaml` went
 * when hosting moved to Vercel (studio#73), which is where the deploy now comes from:
 * `apps/web/vercel.json`, a build command and no schedules.
 *
 * What is worth keeping is the invariant rather than the deletion. A second set of schedules would not
 * fail loudly -- Vercel's crons send no `Authorization: Bearer`, and `/api/sync` and `/api/anchor`
 * require it, so every tick would answer 503 forever and read as a dead app from the outside. These
 * tests keep exactly one caller of the protected routes and keep the leftovers from coming back.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../..", import.meta.url));

/** Repo-relative path, for failure messages that stay readable on any checkout. */
function rel(path: string): string {
  return relative(repoRoot, path);
}

const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "coverage", ".turbo"]);

/** Every file under `dir` whose name passes `match`, with the build and dependency trees left out. */
function filesUnder(dir: string, match: (name: string) => boolean, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) filesUnder(join(dir, entry.name), match, found);
    } else if (match(entry.name)) {
      found.push(join(dir, entry.name));
    }
  }
  return found;
}

describe("#61 Studio has one scheduler", () => {
  it("carries exactly one Vercel config, and it is the deployed app's", () => {
    const configs = filesUnder(repoRoot, (name) => name === "vercel.json").map(rel);
    expect(configs).toEqual([join("apps", "web", "vercel.json")]);
    // The deleted root file must not return: two configs means two places to look for a schedule.
    expect(existsSync(join(repoRoot, "vercel.json"))).toBe(false);
  });

  it("schedules nothing from the Vercel config", () => {
    for (const config of filesUnder(repoRoot, (name) => name === "vercel.json")) {
      const parsed = JSON.parse(readFileSync(config, "utf8")) as Record<string, unknown>;
      expect(Object.keys(parsed), `${config} reintroduces crons`).not.toContain("crons");
    }
  });

  it("has one workflow calling the protected routes, and it sends the bearer token", () => {
    const callers = readdirSync(join(repoRoot, ".github", "workflows"))
      .filter((file) => file.endsWith(".yml"))
      .filter((file) => {
        const body = readFileSync(join(repoRoot, ".github", "workflows", file), "utf8");
        return /\/api\/(sync|anchor)\b/.test(body);
      });
    expect(callers).toEqual(["studio-cron.yml"]);
  });

  it("states in the README which config file the schedules are absent from", () => {
    const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
    const mentions = readme.match(/vercel\.json/g) ?? [];
    const qualified = readme.match(/apps\/web\/vercel\.json/g) ?? [];
    // A bare `vercel.json` now points at a file this repo deleted; every mention has to name the one
    // that exists, or the reader looks in the wrong place for the crons that are not there.
    expect(mentions.length).toBeGreaterThan(0);
    expect(qualified).toHaveLength(mentions.length);
  });

  it("no longer ships the 501 scaffold helper", () => {
    expect(
      existsSync(join(repoRoot, "apps", "web", "app", "api", "_lib", "not-implemented.ts"))
    ).toBe(false);
    const shipped = ["app", "components", "lib"].flatMap((dir) =>
      filesUnder(join(repoRoot, "apps", "web", dir), (name) => /\.(ts|tsx)$/.test(name))
    );
    const definers = shipped.filter((file) => /notImplemented/.test(readFileSync(file, "utf8")));
    expect(definers.map(rel)).toEqual([]);
  });

  it("has no second CRON_SECRET home left by a blueprint", () => {
    // render.yaml generated a CRON_SECRET that nothing read, while the value in use was the repository
    // secret studio-cron passes as a bearer token. Two homes for one secret is a rotation trap.
    expect(existsSync(join(repoRoot, "render.yaml"))).toBe(false);
    expect(filesUnder(repoRoot, (name) => name === "render.yaml")).toEqual([]);
  });
});
