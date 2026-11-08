import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * axe on every page Studio serves (studio#85).
 *
 * Two runs look exactly like a passing test and mean nothing: a page that 404s or redirects has no
 * violations to report, and an analysis that never ran returns an empty list. So each case first asserts
 * the page it means to audit is on screen, and then asserts the payload came from axe itself — the engine
 * name and version axe writes into its own result — before a single violation is read.
 *
 * A report is written per page because the only way to tell a fix from a rule that stopped applying is to
 * have the previous numbers. `axeVersion` is inside the file, not just in its name: axe adds rules between
 * releases, so a run that went green after an upgrade audited less than a run that went red.
 */
const SEEDED_PACT = "1111111111111111111111111111111111111111111111111111111111111111";

/** Playwright's own output directory, resolved the same way for `pnpm e2e` and for a `--config` run. */
const REPORT_DIR = join(process.cwd(), "test-results", "a11y");

interface Audit {
  label: string;
  path: string;
  /** What has to be on screen for this to be the page under audit rather than a refusal of it. */
  expect: (page: Page) => Promise<void>;
}

/** `/pact/<64 hex>` is one page, not twenty: the guard below compares pages, not rows. */
function route(path: string) {
  return /^\/pact\/[^/]+$/.test(path) ? "/pact/:id" : path;
}

const AUDITS: Audit[] = [
  {
    label: "home",
    path: "/",
    expect: async (page) => {
      await expect(page.locator("h1")).toContainText("Purchases, on the record.");
      await expect(page.getByRole("heading", { name: "Three ways in" })).toBeVisible();
    },
  },
  {
    label: "pacts",
    path: "/pacts",
    expect: async (page) => {
      await expect(page.locator("h1")).toContainText("Pact ledger");
      await expect(page.locator("table.ledger")).toBeVisible();
    },
  },
  {
    label: "pact",
    path: `/pact/${SEEDED_PACT}`,
    expect: async (page) => {
      // The heading is the pact's own id, so this cannot be satisfied by the not-found page.
      await expect(page.locator("h1")).toHaveText(SEEDED_PACT);
    },
  },
  {
    label: "verify",
    path: "/verify",
    expect: async (page) => {
      await expect(page.locator("h1")).toContainText("Verify Certificate");
    },
  },
  {
    label: "merchant",
    path: "/merchant",
    expect: async (page) => {
      // No `?seller=` means the first seeded seller, which is the dashboard's real shape: a chooser,
      // metrics and route rows, rather than the "no sellers are registered" note an empty DB prints.
      await expect(page.getByRole("navigation", { name: "Choose a seller" })).toBeVisible();
    },
  },
  {
    label: "merchant-register",
    path: "/merchant/register",
    expect: async (page) => {
      await expect(page.getByRole("heading", { name: "Register a seller" })).toBeVisible();
    },
  },
  {
    label: "principal",
    path: "/principal",
    expect: async (page) => {
      // With data, the heading is the principal's own address and "Principal View" is the label above it;
      // the empty-state page has the heading instead. The chooser only exists once a second principal is
      // seeded, so requiring it proves this is the populated view the audit is meant to cover.
      await expect(page.getByRole("navigation", { name: "Choose a principal" })).toBeVisible();
    },
  },
];

/** The two impacts the issue names. `moderate`, `minor` and unknown are reported but do not fail the run. */
const FAILING = new Set(["critical", "serious"]);

/**
 * Reveals and stamps fade in as the page arrives, and axe multiplies an element's colour by its
 * opacity, so an audit taken during a fade reports the transition as a contrast failure on every word
 * in it. Scrolling once through the page arms every reveal, then the two waits below hold until the
 * page is at rest: the resting state is what the gate is about. An ambient animation that repeats
 * forever is not a transition and does not hold the run.
 */
async function settleReveals(page: Page) {
  await page.evaluate(async () => {
    // The page scrolls smoothly, so every step of this tour would be interrupted by the next one.
    document.documentElement.style.scrollBehavior = "auto";
    const bottom = document.documentElement.scrollHeight;
    for (let y = 0; y < bottom; y += Math.floor(window.innerHeight / 2)) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForFunction(
    () =>
      document.getAnimations().every((animation) => {
        const timing = (animation.effect as KeyframeEffect | null)?.getComputedTiming();
        return animation.playState !== "running" || !Number.isFinite(timing?.iterations ?? 1);
      }),
    undefined,
    { timeout: 20_000 },
  );
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll(".scroll-reveal, .scroll-reveal > *")).every(
        (el) => Number(getComputedStyle(el).opacity) >= 0.99,
      ),
    undefined,
    { timeout: 20_000 },
  );
}

/** `axe-core` is @axe-core/playwright's own dependency, not this app's, so the type is read off its result. */
type Violation = Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"][number];

function failing(violations: Violation[]) {
  return violations.filter((v) => FAILING.has(v.impact ?? "")).map((v) => `${v.id} (${v.impact}) ×${v.nodes.length}`);
}

/** Rule ids only, sorted, so a run can be compared with the list below. */
function failingIds(violations: Violation[]) {
  return violations.filter((v) => FAILING.has(v.impact ?? "")).map((v) => v.id).sort();
}

/**
 * Serious or critical violations this branch reports and does not fix, because the markup that causes them
 * is another issue's line. The issue's own acceptance list allows "fixed **or** listed with a linked
 * issue"; this is the listed half, and it is written so a listing cannot rot into a waiver:
 *
 * - the comparison is an exact set, so a rule that is not named here fails the run;
 * - it is also an exact set in the other direction, so a page that gets *fixed* fails until its entry is
 *   deleted — the debt is removed by evidence, not by leaving a stale exemption behind;
 * - the key names the project and the page, so an exemption cannot drift onto a different viewport;
 * - and a test below refuses an entry whose page no longer exists, so a typo cannot create an inert one.
 */
const KNOWN: Record<string, string[]> = {
  // Empty as of the UI redesign: the last entry was `mobile-chrome:merchant`'s
  // `scrollable-region-focusable`, and the ledger table rules now fit 390 px, so that wrapper no longer
  // scrolls at all (measured: scrollWidth 302 of clientWidth 302). Anything added here needs the same
  // kind of evidence — the rule, the page, the viewport, and why the page cannot fix it.
};

test.beforeAll(() => {
  mkdirSync(REPORT_DIR, { recursive: true });
});

for (const audit of AUDITS) {
  test(`${audit.label} has no serious or critical axe violations`, async ({ page }) => {
    await page.goto(audit.path);
    await audit.expect(page);
    await settleReveals(page);

    const results = await new AxeBuilder({ page }).analyze();

    // A payload with no engine behind it is a run that did not happen, not a clean page. The name is the
    // cheap half; the count is the half with teeth: axe evaluates 90 rules on every one of these pages
    // (measured, and recorded per page in the report), so a result that lists a handful cannot be an audit.
    expect(results.testEngine.name, "axe did not name the engine that analysed the page").toBe("axe-core");
    expect(results.testEngine.version, "axe reported no version, so this result cannot be compared with any other").toBeTruthy();
    const evaluated = results.passes.length + results.violations.length + results.incomplete.length + results.inapplicable.length;
    expect(evaluated, `${audit.path}: axe only evaluated ${evaluated} rules, which is a run that did not happen, not a page with nothing wrong`).toBeGreaterThanOrEqual(40);

    writeFileSync(
      join(REPORT_DIR, `${audit.label}.json`),
      JSON.stringify(
        {
          page: audit.path,
          project: test.info().project.name,
          auditedAt: new Date().toISOString(),
          engine: results.testEngine.name,
          axeVersion: results.testEngine.version,
          url: results.url,
          rulesEvaluated: evaluated,
          failing: failing(results.violations),
          violations: results.violations,
          passes: results.passes.length,
          incomplete: results.incomplete.map((v) => `${v.id} ×${v.nodes.length}`),
          inapplicable: results.inapplicable.map((v) => v.id),
        },
        null,
        2,
      ),
    );

    const key = `${test.info().project.name}:${audit.label}`;
    const expected = [...(KNOWN[key] ?? [])].sort();
    expect(
      failingIds(results.violations),
      `${audit.path}: axe reported ${JSON.stringify(failing(results.violations))}, listed here as ${JSON.stringify(expected)}. ` +
        `A new rule is a new failure; a rule that disappeared means ${key} must be deleted from KNOWN.`,
    ).toEqual(expected);
  });
}

test("every page the home page links to is in the audited list", async ({ page }) => {
  // An audit that silently drops a page is worse than no audit at all: the suite still prints a row of
  // greens. The list is taken from what a visitor can actually reach, so adding a page without auditing
  // it fails here instead of quietly narrowing the gate.
  await page.goto("/");
  const hrefs = await page.locator('a[href^="/"]').evaluateAll((els) => [...new Set(els.map((el) => new URL((el as HTMLAnchorElement).href, "http://x").pathname))]);
  const audited = new Set(AUDITS.map((audit) => route(audit.path)));
  const missing = hrefs.map(route).filter((href) => !audited.has(href));
  expect(missing, `pages linked from / but never audited: ${missing.join(", ")}`).toEqual([]);
});

test("no exemption names a page that is not audited", async () => {
  // The one way this gate could be weakened from inside a test file: an entry whose key matches nothing,
  // silently exempting a typo forever.
  const pairs = new Set(AUDITS.flatMap((audit) => ["chromium", "mobile-chrome"].map((project) => `${project}:${audit.label}`)));
  const stale = Object.keys(KNOWN).filter((key) => !pairs.has(key));
  expect(stale, `KNOWN lists ${stale.join(", ")}, which no audit in this file can produce`).toEqual([]);
});

