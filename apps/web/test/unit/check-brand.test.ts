import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  BRAND_HEX,
  FORBIDDEN_HUE_MAX,
  FORBIDDEN_HUE_MIN,
  hueOf,
  isBrandHex,
  isForbiddenHue,
  scanText,
} from "../../scripts/check-brand.mjs";

/**
 * Fixtures live in os.tmpdir() so the brand guard's teeth are proven without
 * dropping deliberately-offending colours into the repo.
 */
const FIXTURES: Record<string, string> = {
  "prose.css": `/* Nothing here is a gradient: every surface is one flat tone. */
.card { color: var(--text-strong); }
`,
  "warm.css": `.cta { background: #e0505f; color: #1a0f0a; }
`,
  "neutral.css": `.scrim { background: rgba(0, 0, 0, 0.5); }
`,
  "blue.css": `.chip { color: #4fd8f5; }
`,
  "purple.css": `.banner { background: rgba(169, 180, 255, .14); }
`,
  "teal.css": `.rule { border-color: hsl(190 90% 50%); }
`,
  "random.css": `.glyph { color: #7ce6fa; }
`,
  "nontoken.css": `.warm-but-stray { color: #ffaa00; }
`,
  "gradients.css": `.a { background: linear-gradient(var(--ground), var(--surface)); }
.b { background: radial-gradient(var(--surface), var(--deep)); }
.c { background: conic-gradient(var(--accent), var(--brass)); }
.d { background: repeating-linear-gradient(90deg, var(--moss) 0 2px, var(--ground) 2px 4px); }
.e { background: repeating-radial-gradient(var(--surface), var(--deep)); }
.f { background: repeating-conic-gradient(var(--accent), var(--brass)); }
`,
  "gradients.svg": `<svg xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="a"><stop offset="0"/></linearGradient>
    <radialGradient id="b"/>
  </defs>
</svg>
`,
  "gradients.json": `{"layers":[{"ty":"gf"},{"ty": "gs"}]}`,
};

let fixtureDir = "";

beforeAll(() => {
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "pactwright-check-brand-"));
  for (const [name, body] of Object.entries(FIXTURES)) {
    fs.writeFileSync(path.join(fixtureDir, name), body, "utf8");
  }
});

afterAll(() => {
  if (fixtureDir) fs.rmSync(fixtureDir, { recursive: true, force: true });
});

function scan(name: string) {
  return scanText(fs.readFileSync(path.join(fixtureDir, name), "utf8"), name);
}

describe("hueOf", () => {
  it("reads the vermilion accent as a warm hue", () => {
    const hue = hueOf(232, 97, 60);
    expect(hue).toBeGreaterThan(10);
    expect(hue).toBeLessThan(16);
  });

  it("reads cyan and periwinkle into the blue arc", () => {
    expect(hueOf(79, 216, 245)).toBeGreaterThan(180);
    expect(hueOf(169, 180, 255)).toBeGreaterThan(220);
  });

  it("gives a grey no hue claim at all (saturation is what is checked)", () => {
    expect(isForbiddenHue(hueOf(128, 128, 128), 0, 50)).toBe(false);
  });
});

describe("isForbiddenHue", () => {
  it("bans the blue -> violet arc, inclusive of both edges", () => {
    expect(isForbiddenHue(FORBIDDEN_HUE_MIN, 90, 50)).toBe(true);
    expect(isForbiddenHue(FORBIDDEN_HUE_MAX, 90, 50)).toBe(true);
    expect(isForbiddenHue(250, 40, 30)).toBe(true);
  });

  it("lets warm hues, neutrals and near-black/near-white through", () => {
    expect(isForbiddenHue(13, 80, 50)).toBe(false); // accent vermilion
    expect(isForbiddenHue(50, 60, 60)).toBe(false); // brass
    expect(isForbiddenHue(184, 90, 50)).toBe(false); // just outside the arc
    expect(isForbiddenHue(331, 90, 50)).toBe(false); // just outside the arc
    expect(isForbiddenHue(220, 5, 50)).toBe(false); // saturation below 12%
    expect(isForbiddenHue(220, 90, 4)).toBe(false); // too dark to be a claim
    expect(isForbiddenHue(220, 90, 96)).toBe(false); // too light to be a claim
  });
});

describe("BRAND_HEX allow-list", () => {
  it("holds the :root tokens and only those", () => {
    expect(BRAND_HEX).toContain("#e0505f"); // accent
    expect(BRAND_HEX).toContain("#12100e"); // ground
    expect(BRAND_HEX).toContain("#8fbf6d"); // moss
    expect(BRAND_HEX).toHaveLength(18);
    for (const hex of BRAND_HEX) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("normalizes shorthand and drops an alpha suffix", () => {
    expect(isBrandHex("#e0505f")).toBe(true);
    expect(isBrandHex("#E0505FFF")).toBe(true);
    expect(isBrandHex("#7ce6fa")).toBe(false);
  });
});

describe("gradients", () => {
  it("catches every CSS gradient function form, once each", () => {
    const problems = scan("gradients.css");
    expect(problems).toHaveLength(6);
    expect(problems.map((p) => p.literal)).toEqual([
      "linear-gradient(",
      "radial-gradient(",
      "conic-gradient(",
      "repeating-linear-gradient(",
      "repeating-radial-gradient(",
      "repeating-conic-gradient(",
    ]);
    expect(problems.every((p) => p.rule === "gradient")).toBe(true);
  });

  it("catches both SVG gradient elements", () => {
    const problems = scan("gradients.svg");
    expect(problems).toHaveLength(2);
    expect(problems.map((p) => p.literal)).toEqual(["<linearGradient", "<radialGradient"]);
  });

  it("catches Lottie gradient fill and stroke shape types", () => {
    const problems = scan("gradients.json");
    expect(problems).toHaveLength(2);
    expect(problems.every((p) => p.rule === "gradient")).toBe(true);
    expect(problems.map((p) => p.literal)).toEqual(['"ty":"gf"', '"ty": "gs"']);
  });

  it("does not fail on the bare word 'gradient' in a prose comment", () => {
    expect(scan("prose.css")).toHaveLength(0);
  });
});

describe("blue/violet colour literals", () => {
  it("flags a cyan hex with its file, line and literal", () => {
    const problems = scan("blue.css");
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({
      file: "blue.css",
      line: 1,
      rule: "forbidden-colour",
      literal: "#4fd8f5",
    });
    expect(problems[0].column).toBe(FIXTURES["blue.css"].indexOf("#4fd8f5") + 1);
  });

  it("flags a translucent purple rgba", () => {
    const problems = scan("purple.css");
    expect(problems).toHaveLength(1);
    expect(problems[0].rule).toBe("forbidden-colour");
    expect(problems[0].literal).toContain("rgba(169, 180, 255, .14)");
  });

  it("flags a teal hsl in the modern space-separated syntax", () => {
    const problems = scan("teal.css");
    expect(problems).toHaveLength(1);
    expect(problems[0].rule).toBe("forbidden-colour");
    expect(problems[0].literal).toBe("hsl(190 90% 50%)");
  });

  it("lets the warm accent through", () => {
    expect(scan("warm.css")).toHaveLength(0);
  });

  it("lets a fully neutral rgba through, because saturation is 0", () => {
    expect(scan("neutral.css")).toHaveLength(0);
  });
});

describe("non-token hex", () => {
  it("fails a blue random hex (caught by the hue rule first)", () => {
    const problems = scan("random.css");
    expect(problems).toHaveLength(1);
    expect(problems[0].literal).toBe("#7ce6fa");
    expect(problems[0].rule).toBe("forbidden-colour");
  });

  it("fails a warm hex that is still not a :root token", () => {
    const problems = scan("nontoken.css");
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ rule: "non-token-hex", literal: "#ffaa00" });
  });
});
