#!/usr/bin/env node
/**
 * check-brand.mjs — the Pactwright Studio brand guard.
 *
 * Three invariants the identity is not allowed to break:
 *
 *   1. no gradients   — no CSS gradient function, no SVG gradient element, no
 *                       Lottie gradient shape. Only the call/element syntax is
 *                       matched, so the noun "gradient" in a comment is fine.
 *   2. no blue/violet — no colour literal whose hue sits in the blue -> violet
 *                       arc: h in [185deg, 330deg], s >= 12%, l in [8%, 92%].
 *   3. no stray hex   — every hex literal must be one of the :root tokens in
 *                       app/globals.css (BRAND_HEX below). That block is the
 *                       only place the values are declared; everywhere else
 *                       reaches them through var(--token). A hex outside the
 *                       list means someone smuggled in a colour that is not a
 *                       token (and a :root edit that is not reflected in
 *                       BRAND_HEX fails too, so palette drift is a review).
 *
 * Scan scope (resolved from this file, never from process.cwd()):
 *   app/, components/, lib/  -> .css .ts .tsx .svg
 *   public/                  -> .svg
 *   public/lottie/           -> .json (gradient shape types only)
 *
 * Zero dependencies, Node 22+.
 *
 * Usage:
 *   node apps/web/scripts/check-brand.mjs            human output
 *   node apps/web/scripts/check-brand.mjs --json     machine output
 *   node apps/web/scripts/check-brand.mjs --self-test
 *
 * Exit: 0 clean / self-test proven, 1 problems / self-test failed, 2 usage error.
 *
 * The pure helpers (`scanText`, `hueOf`, `isForbiddenHue`, `BRAND_HEX`) are
 * exported for apps/web/test/unit/check-brand.test.ts.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* ------------------------------------------------------------------ tokens */

/**
 * The complete colour set from `:root` in app/globals.css. Every hex literal in
 * the scanned source must be one of these; anything else is not a brand colour.
 */
export const BRAND_HEX = Object.freeze([
  "#12100e", // ground
  "#17130f", // deep
  "#1d1814", // surface
  "#251f19", // surface-raised
  "#2e2720", // surface-hover
  "#eeece9", // ink, strongest
  "#d9cdbb", // ink
  "#a99c8a", // ink, muted
  "#8a7e6d", // ink, faint
  "#c9bda9", // bone
  "#e0505f", // accent
  "#1a0f0a", // ink on accent
  "#ea6170", // accent hover
  "#f07a86", // accent as text on a surface
  "#3a3129", // surface, pressed
  "#8fbf6d", // moss
  "#d9a441", // brass
  "#e08078", // rust
]);

const BRAND_SET = new Set(BRAND_HEX);

/** Banned hue arc, in degrees, inclusive. Blue through violet. */
export const FORBIDDEN_HUE_MIN = 185;
export const FORBIDDEN_HUE_MAX = 330;
/** Below this saturation a colour is a neutral and cannot be "blue". */
export const FORBIDDEN_MIN_SAT = 12;
/** Near-black and near-white are ground/ink, not a hue claim. */
export const FORBIDDEN_MIN_LIGHT = 8;
export const FORBIDDEN_MAX_LIGHT = 92;

/* ---------------------------------------------------------------- patterns */

// #rgb / #rrggbb / #rrggbbaa. The lookahead keeps a 6-digit hex inside a longer
// run of hex characters (e.g. "Ledger #5455340") from being half-matched.
const HEX_RE = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/g;
const RGB_RE = /(?<![\w-])rgba?\(([^)]*)\)/gi;
const HSL_RE = /(?<![\w-])hsla?\(([^)]*)\)/gi;

// The function syntax only: "linear-gradient(", never the bare noun.
const CSS_GRADIENT_RE = /\b((?:repeating-)?(?:linear|radial|conic)-gradient)\s*\(/gi;
// SVG paint servers. React/JSX and hand-written SVG both use camelCase.
const SVG_GRADIENT_RE = /<(linearGradient|radialGradient)\b/gi;
// Lottie shape types: "gf" = gradient fill, "gs" = gradient stroke.
const LOTTIE_GRADIENT_RE = /"ty"\s*:\s*"(gf|gs)"/g;

/* ------------------------------------------------------------------ colour */

function clampByte(n) {
  if (!Number.isFinite(n)) return NaN;
  return Math.min(255, Math.max(0, n));
}

/**
 * sRGB (0-255) -> HSL. Hue in degrees [0, 360), saturation and lightness in
 * percent [0, 100]. Implemented here so the guard needs no dependency.
 */
export function rgbToHsl(r, g, b) {
  const rr = clampByte(r) / 255;
  const gg = clampByte(g) / 255;
  const bb = clampByte(b) / 255;
  if ([rr, gg, bb].some((n) => Number.isNaN(n))) return null;

  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const delta = max - min;
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;
  if (delta !== 0) {
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    if (max === rr) h = ((gg - bb) / delta) % 6;
    else if (max === gg) h = (bb - rr) / delta + 2;
    else h = (rr - gg) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  return {
    h: Math.round(h * 10) / 10,
    s: Math.round(s * 1000) / 10,
    l: Math.round(l * 1000) / 10,
  };
}

/** Hue, in degrees, of an sRGB triple. */
export function hueOf(r, g, b) {
  const hsl = rgbToHsl(r, g, b);
  return hsl ? hsl.h : NaN;
}

/**
 * True when a hue/saturation/lightness triple is in the banned blue -> violet
 * arc. Saturation and lightness are percentages.
 */
export function isForbiddenHue(h, s, l) {
  if (![h, s, l].every((n) => typeof n === "number" && Number.isFinite(n))) return false;
  if (s < FORBIDDEN_MIN_SAT) return false;
  if (l < FORBIDDEN_MIN_LIGHT || l > FORBIDDEN_MAX_LIGHT) return false;
  return h >= FORBIDDEN_HUE_MIN && h <= FORBIDDEN_HUE_MAX;
}

/** `#abc` / `#aabbccdd` -> `#aabbcc`, lower case. Throws on non-hex input. */
export function normalizeHex(literal) {
  let body = String(literal).trim().replace(/^#/, "");
  if (body.length === 3) body = body.split("").map((c) => c + c).join("");
  if (body.length === 8) body = body.slice(0, 6);
  if (!/^[0-9a-fA-F]{6}$/.test(body)) throw new Error(`not a hex colour: ${literal}`);
  return `#${body.toLowerCase()}`;
}

/** True when the literal, alpha stripped, is one of the :root tokens. */
export function isBrandHex(literal) {
  try {
    return BRAND_SET.has(normalizeHex(literal));
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------ text scanning */

function lineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}

function locate(starts, index) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= index) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, column: index - starts[lo] + 1 };
}

function splitArgs(inner) {
  return inner.trim().split(/[\s,/]+/).filter(Boolean);
}

function rgbComponent(token) {
  const value = parseFloat(token);
  if (!Number.isFinite(value)) return NaN;
  return token.endsWith("%") ? (value / 100) * 255 : value;
}

function hslFromArgs(inner) {
  const args = splitArgs(inner);
  if (args.length < 3) return null;
  const h = parseFloat(args[0]);
  const s = parseFloat(args[1]);
  const l = parseFloat(args[2]);
  if (![h, s, l].every(Number.isFinite)) return null;
  return { h: ((h % 360) + 360) % 360, s, l };
}

function rgbFromArgs(inner) {
  const args = splitArgs(inner);
  if (args.length < 3) return null;
  const [r, g, b] = args.slice(0, 3).map(rgbComponent);
  if (![r, g, b].every(Number.isFinite)) return null;
  return rgbToHsl(r, g, b);
}

function formatHsl(hsl) {
  return `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
}

/**
 * Pure scanner: every brand problem in one file's text.
 *
 * Returns `{ file, line, column, rule, literal, detail }` records where `rule`
 * is one of "gradient", "forbidden-colour" (blue/violet hue) or "non-token-hex".
 * Each offending literal produces exactly one record, so counts are honest.
 *
 * A `.json` filename is treated as Lottie: only gradient shape types are read.
 */
export function scanText(text, filename = "<text>") {
  const source = String(text);
  const problems = [];
  const starts = lineStarts(source);

  const add = (index, rule, literal, detail) => {
    const { line, column } = locate(starts, index);
    problems.push({ file: filename, line, column, rule, literal, detail });
  };

  if (/\.json$/i.test(filename)) {
    for (const m of source.matchAll(LOTTIE_GRADIENT_RE)) {
      add(m.index, "gradient", m[0].replace(/\s+/g, " "), "Lottie gradient shape type");
    }
    return problems;
  }

  /* rule 1: gradient syntax */
  for (const m of source.matchAll(CSS_GRADIENT_RE)) {
    add(m.index, "gradient", `${m[1]}(`, "CSS gradient function");
  }
  for (const m of source.matchAll(SVG_GRADIENT_RE)) {
    add(m.index, "gradient", `<${m[1]}`, "SVG gradient element");
  }

  /* rule 2 + 3: colour literals */
  for (const m of source.matchAll(HEX_RE)) {
    const literal = m[0];
    let hsl;
    try {
      hsl = rgbToHsl(
        parseInt(normalizeHex(literal).slice(1, 3), 16),
        parseInt(normalizeHex(literal).slice(3, 5), 16),
        parseInt(normalizeHex(literal).slice(5, 7), 16),
      );
    } catch {
      continue;
    }
    if (!hsl) continue;
    if (isForbiddenHue(hsl.h, hsl.s, hsl.l)) {
      add(m.index, "forbidden-colour", literal, `blue/violet ${formatHsl(hsl)}`);
    } else if (!isBrandHex(literal)) {
      add(m.index, "non-token-hex", literal, "not in the canonical :root token set — use var(--token)");
    }
  }

  for (const m of source.matchAll(RGB_RE)) {
    const hsl = rgbFromArgs(m[1]);
    if (!hsl) continue;
    if (isForbiddenHue(hsl.h, hsl.s, hsl.l)) {
      add(m.index, "forbidden-colour", m[0].replace(/\s+/g, " "), `blue/violet ${formatHsl(hsl)}`);
    }
  }

  for (const m of source.matchAll(HSL_RE)) {
    const hsl = hslFromArgs(m[1]);
    if (!hsl) continue;
    if (isForbiddenHue(hsl.h, hsl.s, hsl.l)) {
      add(m.index, "forbidden-colour", m[0].replace(/\s+/g, " "), `blue/violet ${formatHsl(hsl)}`);
    }
  }

  problems.sort((a, b) => a.line - b.line || a.column - b.column);
  return problems;
}

/* ---------------------------------------------------------------- the walk */

const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "test-results", "playwright-report"]);

const SOURCE_ROOTS = [
  { dir: "app", exts: new Set([".css", ".ts", ".tsx", ".svg"]) },
  { dir: "components", exts: new Set([".css", ".ts", ".tsx", ".svg"]) },
  { dir: "lib", exts: new Set([".css", ".ts", ".tsx", ".svg"]) },
  { dir: "public", exts: new Set([".svg"]) },
];

const LOTTIE_DIR = path.join("public", "lottie");

function walk(dir, exts, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(full, exts, out);
    } else if (entry.isFile() && exts.has(path.extname(entry.name).toLowerCase())) {
      out.push(full);
    }
  }
}

function collectFiles(root) {
  const files = [];
  for (const { dir, exts } of SOURCE_ROOTS) walk(path.join(root, dir), exts, files);
  const lottie = [];
  walk(path.join(root, LOTTIE_DIR), new Set([".json"]), lottie);
  for (const file of lottie) files.push(file);
  files.sort();
  return files;
}

/**
 * Scan a web root (`apps/web`). Paths on each problem are relative to that
 * root, POSIX separators, so the output is stable across platforms.
 */
export function scanTree(root) {
  const problems = [];
  for (const file of collectFiles(root)) {
    const rel = path.relative(root, file).split(path.sep).join("/");
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    problems.push(...scanText(text, rel));
  }
  return problems;
}

/* ------------------------------------------------------------------ report */

const USAGE = `usage: node apps/web/scripts/check-brand.mjs [--json | --self-test]

Scans app/, components/, lib/ (.css .ts .tsx .svg) and public/ (.svg, plus
Lottie .json under public/lottie/) for three things: gradient syntax, colour
literals in the blue -> violet arc (hue 185-330, s >= 12%, l 8-92%), and hex
literals that are not a :root token.

  (default)    list every problem, then a summary count
  --json       machine-readable results
  --self-test  prove the checker has teeth against a temp fixture tree
  --help       this text

exit 0 clean / proven, 1 problems / self-test failed, 2 usage error`;

export function countByRule(problems) {
  const byRule = { gradient: 0, "forbidden-colour": 0, "non-token-hex": 0 };
  for (const p of problems) byRule[p.rule] = (byRule[p.rule] ?? 0) + 1;
  return byRule;
}

function groupByFile(problems) {
  const files = new Map();
  for (const p of problems) {
    if (!files.has(p.file)) files.set(p.file, []);
    files.get(p.file).push(p);
  }
  return files;
}

/* --------------------------------------------------------------- self-test */

function writeFixture(root, rel, body) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body, "utf8");
}

function buildSelfTestFixtures(root) {
  // A good file: prose about gradients, token declarations in :root, a neutral
  // rgba (saturation 0) and an allow-listed warm accent. Must yield nothing.
  writeFixture(
    root,
    path.join("app", "brand-good.css"),
    `/* Flat tones only: no gradient here, nothing blue or violet. */
:root {
  --ground: #12100e;
  --accent: #e8613c;
  --accent-subtle: rgba(232, 97, 60, 0.14);
}
.scrim { background: rgba(0, 0, 0, 0.5); }
.cta { background: #e8613c; color: #1a0f0a; }
`,
  );

  // Six CSS gradient functions, colours expressed as tokens so only the
  // gradient itself is being counted.
  writeFixture(
    root,
    path.join("app", "bad-gradients.css"),
    `.a { background: linear-gradient(var(--ground), var(--surface)); }
.b { background: radial-gradient(var(--surface), var(--deep)); }
.c { background: conic-gradient(var(--accent), var(--brass)); }
.d { background: repeating-linear-gradient(90deg, var(--moss) 0 2px, var(--ground) 2px 4px); }
.e { background: repeating-radial-gradient(var(--surface), var(--deep)); }
.f { background: repeating-conic-gradient(var(--accent), var(--brass)); }
`,
  );

  // Both SVG paint servers.
  writeFixture(
    root,
    path.join("public", "art", "bad-gradients.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
  <defs>
    <linearGradient id="a"><stop offset="0"/></linearGradient>
    <radialGradient id="b"/>
  </defs>
</svg>
`,
  );

  // Both Lottie gradient shape types.
  writeFixture(
    root,
    path.join("public", "lottie", "bad-gradients.json"),
    `{"layers":[{"ty":"gf"},{"ty": "gs"}]}`,
  );

  // Three blue/violet colour literals: cyan hex, periwinkle rgba, teal hsl.
  writeFixture(
    root,
    path.join("components", "bad-colours.tsx"),
    `export const Swatch = () => (
  <div
    style={{
      color: "#4fd8f5",
      background: "rgba(169, 180, 255, .14)",
      borderColor: "hsl(190 90% 50%)",
    }}
  />
);
`,
  );

  // A warm but non-token hex: not blue, still not allowed.
  writeFixture(root, path.join("lib", "bad-token.ts"), `export const shade = "#ffaa00";\n`);
}

/** Expected fixture violations, one record per violation. */
const SELF_TEST_EXPECTED = Object.freeze({
  gradient: 10, // 6 CSS + 2 SVG + 2 Lottie
  "forbidden-colour": 3,
  "non-token-hex": 1,
});

function selfTest() {
  const total = Object.values(SELF_TEST_EXPECTED).reduce((a, b) => a + b, 0);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pactwright-brand-selftest-"));

  try {
    buildSelfTestFixtures(root);
    const problems = scanTree(root);
    const found = countByRule(problems);
    const foundTotal = problems.length;

    const lines = [`--self-test fixture tree: ${root} (removed on exit)`];
    for (const [file, hits] of [...groupByFile(problems).entries()].sort()) {
      lines.push(`  ${file}  ${hits.length} problem(s)`);
      for (const hit of hits) {
        lines.push(`    ${hit.line}:${hit.column}  [${hit.rule}]  ${hit.literal}  (${hit.detail})`);
      }
    }

    const rows = Object.keys(SELF_TEST_EXPECTED).map(
      (rule) => `${rule} ${found[rule] ?? 0}/${SELF_TEST_EXPECTED[rule]}`,
    );
    lines.push(`  expected ${total} problem(s): ${rows.join(", ")}`);
    lines.push(`  found    ${foundTotal} problem(s): ${rows.join(", ")}`);

    const clean =
      foundTotal === total &&
      Object.entries(SELF_TEST_EXPECTED).every(([rule, n]) => (found[rule] ?? 0) === n);

    if (clean) {
      lines.push(`PASS: checker catches exactly ${total} problem(s), one per planted violation.`);
      lines.push("      the good fixture (prose 'gradient', :root tokens, neutral rgba) stayed clean.");
      process.stdout.write(`${lines.join("\n")}\n`);
      return 0;
    }

    const missing = Object.entries(SELF_TEST_EXPECTED)
      .map(([rule, n]) => `${rule}: expected ${n}, found ${found[rule] ?? 0}`)
      .join("; ");
    lines.push(`FAIL: expected ${total} problem(s), found ${foundTotal} (${missing}).`);
    process.stderr.write(`${lines.join("\n")}\n`);
    return 1;
  } catch (error) {
    process.stderr.write(`FAIL: self-test threw: ${error && error.stack ? error.stack : error}\n`);
    return 1;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

/* -------------------------------------------------------------------- main */

function main(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  if (argv.includes("--self-test")) {
    const unknown = argv.filter((a) => a !== "--self-test");
    if (unknown.length) {
      process.stderr.write(`unknown argument: ${unknown[0]}\n\n${USAGE}\n`);
      return 2;
    }
    return selfTest();
  }

  const json = argv.includes("--json");
  const unknown = argv.filter((a) => a !== "--json");
  if (unknown.length) {
    process.stderr.write(`unknown argument: ${unknown[0]}\n\n${USAGE}\n`);
    return 2;
  }

  const here = path.dirname(fileURLToPath(import.meta.url));
  const webRoot = path.resolve(here, "..");
  const problems = scanTree(webRoot);
  const byRule = countByRule(problems);
  const files = groupByFile(problems);
  const fileList = [...files.keys()].sort();

  if (json) {
    const payload = {
      ok: problems.length === 0,
      root: "apps/web",
      totals: { problems: problems.length, files: fileList.length, byRule },
      problems,
    };
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return problems.length === 0 ? 0 : 1;
  }

  if (problems.length === 0) {
    process.stdout.write(
      `brand check: clean — 0 problems across app/, components/, lib/, public/\n`,
    );
    return 0;
  }

  for (const file of fileList) {
    process.stdout.write(`apps/web/${file}\n`);
    for (const hit of files.get(file)) {
      process.stdout.write(
        `  ${hit.line}:${hit.column}  [${hit.rule}]  ${hit.literal}  ${hit.detail}\n`,
      );
    }
  }

  process.stdout.write(
    `\nbrand check: ${problems.length} problem(s) in ${fileList.length} file(s) — ` +
      `gradient ${byRule.gradient}, forbidden-colour ${byRule["forbidden-colour"]}, ` +
      `non-token-hex ${byRule["non-token-hex"]}\n`,
  );
  return 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
