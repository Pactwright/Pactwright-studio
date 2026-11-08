#!/usr/bin/env node
/**
 * Writes the Studio's brand Lottie files, deterministically.
 *
 *   node apps/web/scripts/build-lottie.mjs
 *
 * Output:
 *   apps/web/public/lottie/seal-press.json
 *   apps/web/public/lottie/receipt-stitch.json
 *
 * Schema: Lottie 5.13.0, shape layers only (ty: 4), flat fills and strokes.
 * Palette is locked to the warm Pactwright register (vermilion, bone, brass,
 * moss, ground) and no gradient shape type may appear. Nothing here reads the
 * clock or randomises, so re-running produces byte-identical files.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "..", "public", "lottie");

const SCHEMA_VERSION = "5.13.0";
const FPS = 60;

// ---------------------------------------------------------------------------
// Palette. Every colour in the output must come from this table. Values are
// normalised 0..1 triples (Lottie's native colour form), rounded to six places
// so the JSON stays small and stable.
// ---------------------------------------------------------------------------
const rgb = (hex) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round((v / 255) * 1e6) / 1e6);
};

const PALETTE = {
  vermilion: "#e0505f", // --accent, sealing wax
  bone: "#eeece9", // --text-strong, paper and ink
  brass: "#d9a441", // --brass, Merkle data
  moss: "#8fbf6d", // --moss, verified
  ground: "#12100e", // --void, ground
};

const C = Object.fromEntries(Object.entries(PALETTE).map(([name, hex]) => [name, rgb(hex)]));

// ---------------------------------------------------------------------------
// Easing. A keyframe carries the two bezier control points of the segment that
// starts there: `o` near the start, `i` near the next keyframe. Handle arrays
// need one entry per animated value dimension.
// ---------------------------------------------------------------------------
const EASINGS = {
  // cubic-bezier(0, 0, 0.35, 1) — decelerate into place.
  out: { o: [0, 0], i: [0.35, 1] },
  // cubic-bezier(0.55, 0, 1, 0.45) — accelerate, for a falling stamp.
  in: { o: [0.55, 0], i: [1, 0.45] },
  // cubic-bezier(0.4, 0, 0.2, 1) — accelerate then settle.
  inOut: { o: [0.4, 0], i: [0.2, 1] },
  // cubic-bezier(0.2, 0, 0.4, 1) — soft.
  soft: { o: [0.2, 0], i: [0.4, 1] },
};

const handles = (dims, kind) => {
  const { o, i } = EASINGS[kind];
  const axis = (v) => Array.from({ length: dims }, () => v);
  return { i: { x: axis(i[0]), y: axis(i[1]) }, o: { x: axis(o[0]), y: axis(o[1]) } };
};

/** Static property. */
const fixed = (k) => ({ a: 0, k });

/**
 * Animated property.
 * @param {Array<[number, number[]]>} stops [[frame, values], ...] ascending.
 * @param {keyof typeof EASINGS} easing
 */
const animated = (stops, easing = "out") => {
  if (stops.length < 2) throw new Error("animated() needs at least two stops");
  const dims = stops[0][1].length;
  for (const [t, values] of stops) {
    if (values.length !== dims) throw new Error("animated() stops must share a dimension");
    if (!Number.isInteger(t) || t < 0) throw new Error(`animated() frame ${t} is invalid`);
  }
  return {
    a: 1,
    k: stops.map(([t, s], index) => {
      const next = stops[index + 1];
      if (!next) return { t, s };
      if (next[0] <= t) throw new Error("animated() stops must ascend in time");
      // Lottie 5.x reads the segment end from the next keyframe's `s`; the old
      // duplicate `e` field is omitted to keep the files small.
      return { t, s, ...handles(dims, easing) };
    }),
  };
};

// ---------------------------------------------------------------------------
// Shape primitives (Lottie shape-layer schema).
// ---------------------------------------------------------------------------
const groupTransform = (nm = "Transform") => ({
  ty: "tr",
  p: fixed([0, 0]),
  a: fixed([0, 0]),
  s: fixed([100, 100]),
  r: fixed(0),
  o: fixed(100),
  sk: fixed(0),
  sa: fixed(0),
  nm,
});

const ellipse = (size, position = [0, 0], nm = "Ellipse Path 1") => ({
  ty: "el",
  d: 1,
  p: fixed(position),
  s: fixed(size),
  nm,
});

const rect = (size, position = [0, 0], radius = 0, nm = "Rectangle Path 1") => ({
  ty: "rc",
  d: 1,
  p: fixed(position),
  s: fixed(size),
  r: fixed(radius),
  nm,
});

/** Bezier path; vertex is [x, y, inX, inY, outX, outY]. */
const path = (vertices, { closed = false, nm = "Path 1" } = {}) => ({
  ty: "sh",
  ind: 0,
  ks: fixed({
    i: vertices.map(([, , ix, iy]) => [ix ?? 0, iy ?? 0]),
    o: vertices.map(([, , , , ox, oy]) => [ox ?? 0, oy ?? 0]),
    v: vertices.map(([x, y]) => [x, y]),
    c: closed,
  }),
  nm,
});

const polyline = (points, nm = "Path 1") =>
  path(points.map(([x, y]) => [x, y, 0, 0, 0, 0]), { closed: false, nm });

const fill = (color, nm = "Fill 1", opacity = 100) => ({
  ty: "fl",
  c: fixed(color),
  o: fixed(opacity),
  r: 1,
  bm: 0,
  nm,
});

const stroke = (color, width, nm = "Stroke 1", { opacity = 100, cap = 2, join = 2 } = {}) => ({
  ty: "st",
  c: fixed(color),
  o: fixed(opacity),
  w: fixed(width),
  lc: cap,
  lj: join,
  ml: 4,
  bm: 0,
  nm,
});

const group = (items, nm) => ({
  ty: "gr",
  it: [...items, groupTransform()],
  nm,
  np: items.length + 1,
  cix: 2,
  bm: 0,
});

/** Trim paths reveal a stroke from its start point (used for ruled lines). */
const trim = (stops, nm = "Trim Paths 1") => ({
  ty: "tm",
  s: fixed(0),
  e: animated(stops, "inOut"),
  o: fixed(0),
  m: 1,
  nm,
});

// ---------------------------------------------------------------------------
// Layer / document helpers.
// ---------------------------------------------------------------------------
const shapeLayer = ({ ind, nm, ks = {}, shapes, op }) => ({
  ddd: 0,
  ind,
  ty: 4,
  nm,
  sr: 1,
  ks: {
    o: ks.o ?? fixed(100),
    r: ks.r ?? fixed(0),
    p: ks.p ?? fixed([0, 0, 0]),
    a: ks.a ?? fixed([0, 0, 0]),
    s: ks.s ?? fixed([100, 100, 100]),
  },
  ao: 0,
  shapes,
  ip: 0,
  op,
  st: 0,
  bm: 0,
});

const doc = ({ nm, w, h, op, layers }) => ({
  v: SCHEMA_VERSION,
  fr: FPS,
  ip: 0,
  op,
  w,
  h,
  nm,
  ddd: false,
  assets: [],
  layers,
});

// ---------------------------------------------------------------------------
// 1. seal-press.json — a wax seal struck onto a sheet of paper.
//    Canvas 900x900, 60fps, 144 frames (2.4s).
// ---------------------------------------------------------------------------
const sealPress = () => {
  const OP = 144;
  const cx = 450;
  const cy = 470;

  const paper = shapeLayer({
    ind: 5,
    nm: "Paper",
    op: OP,
    ks: {
      p: fixed([cx, cy, 0]),
      s: animated(
        [
          [0, [97, 97, 100]],
          [40, [100, 100, 100]],
        ],
        "out",
      ),
      o: animated(
        [
          [0, [0]],
          [20, [100]],
        ],
        "out",
      ),
    },
    shapes: [
      group([rect([360, 2], [0, 232], 1, "Rule 1"), fill(C.bone, "Rule 1 fill", 16)], "Rule 1"),
      group([rect([300, 2], [0, 260], 1, "Rule 2"), fill(C.bone, "Rule 2 fill", 16)], "Rule 2"),
      group([rect([400, 2], [0, -244], 1, "Rule 3"), fill(C.bone, "Rule 3 fill", 16)], "Rule 3"),
      // First shape in a layer paints on top: the sheet goes last.
      group([rect([560, 620], [0, 0], 18, "Sheet"), fill(C.bone, "Sheet fill", 4)], "Sheet"),
    ],
  });

  const disc = shapeLayer({
    ind: 4,
    nm: "Wax disc",
    op: OP,
    ks: {
      p: animated(
        [
          [10, [cx, 190, 0]],
          [64, [cx, cy, 0]],
        ],
        "in",
      ),
      r: animated(
        [
          [10, [-6]],
          [64, [0]],
        ],
        "out",
      ),
      s: animated(
        [
          [10, [134, 134, 100]],
          [64, [100, 100, 100]],
          [70, [106, 106, 100]],
          [82, [100, 100, 100]],
        ],
        "inOut",
      ),
      o: animated(
        [
          [10, [0]],
          [18, [100]],
        ],
        "out",
      ),
    },
    shapes: [
      group([ellipse([192, 192], [0, 0], "Seal rim"), stroke(C.bone, 3, "Rim stroke", { opacity: 34 })], "Seal rim"),
      group([ellipse([220, 220], [0, 0], "Seal disc"), fill(C.vermilion)], "Seal disc"),
    ],
  });

  const pressRing = shapeLayer({
    ind: 3,
    nm: "Press ring",
    op: OP,
    ks: {
      p: animated(
        [
          [34, [cx, 300, 0]],
          [70, [cx, cy, 0]],
        ],
        "in",
      ),
      s: animated(
        [
          [34, [146, 146, 100]],
          [70, [100, 100, 100]],
        ],
        "out",
      ),
      o: animated(
        [
          [34, [0]],
          [42, [70]],
          [62, [70]],
          [82, [0]],
        ],
        "soft",
      ),
    },
    shapes: [group([ellipse([220, 220], [0, 0], "Ring path"), stroke(C.brass, 5, "Ring stroke")], "Press ring")],
  });

  const impactRing = shapeLayer({
    ind: 2,
    nm: "Impact ring",
    op: OP,
    ks: {
      p: fixed([cx, cy, 0]),
      s: animated(
        [
          [68, [100, 100, 100]],
          [104, [200, 200, 100]],
        ],
        "out",
      ),
      o: animated(
        [
          [68, [0]],
          [70, [55]],
          [84, [26]],
          [104, [0]],
        ],
        "inOut",
      ),
    },
    shapes: [group([ellipse([220, 220], [0, 0], "Impact path"), stroke(C.bone, 4, "Impact stroke")], "Impact")],
  });

  // The "P" is a stem plus an open bowl; both settle on top of the wax.
  const pMark = shapeLayer({
    ind: 1,
    nm: "P mark",
    op: OP,
    ks: {
      p: fixed([cx, cy, 0]),
      r: animated(
        [
          [80, [-8]],
          [94, [0]],
        ],
        "out",
      ),
      s: animated(
        [
          [80, [28, 28, 100]],
          [94, [112, 112, 100]],
          [104, [100, 100, 100]],
        ],
        "out",
      ),
      o: animated(
        [
          [80, [0]],
          [88, [100]],
        ],
        "soft",
      ),
    },
    shapes: [
      // One stroked contour: stem up, across the cap line, round the bowl and
      // back into the stem. Reads as a capital P at any size.
      group(
        [
          path(
            [
              [-40, 72, 0, 0, 0, 0],
              [-40, -72, 0, 0, 0, 0],
              [8, -72, 0, 0, 20, 0],
              [42, -58, 0, -10, 0, 12],
              [42, -24, 0, -10, 0, 10],
              [2, -8, 18, 0, 0, 0],
              [-40, -8, 0, 0, 0, 0],
            ],
            { closed: false, nm: "P path" },
          ),
          stroke(C.bone, 24, "P stroke", { cap: 2, join: 2 }),
        ],
        "P",
      ),
    ],
  });

  // First layer paints on top (After Effects stacking order).
  return doc({ nm: "Pactwright seal press", w: 900, h: 900, op: OP, layers: [pMark, pressRing, impactRing, disc, paper] });
};

// ---------------------------------------------------------------------------
// 2. receipt-stitch.json — a certificate printed, ruled, ticked and stamped.
//    Canvas 1200x600, 60fps, 168 frames (2.8s).
// ---------------------------------------------------------------------------
const receiptStitch = () => {
  const OP = 168;
  const cx = 600;
  const cy = 300;
  const CARD_W = 620;
  const CARD_H = 400;
  const half = CARD_W / 2; // anchor offset so the card grows from its left edge

  const card = shapeLayer({
    ind: 7,
    nm: "Card",
    op: OP,
    ks: {
      p: fixed([cx - half, cy, 0]),
      a: fixed([-half, 0, 0]),
      s: animated(
        [
          [0, [8, 100, 100]],
          [34, [100, 100, 100]],
        ],
        "out",
      ),
      o: animated(
        [
          [0, [0]],
          [10, [100]],
        ],
        "out",
      ),
    },
    shapes: [
      // First shape paints on top: the header sits over the paper body.
      group([rect([220, 20], [-190, -150], 3, "Header"), fill(C.ground)], "Header"),
      group([rect([CARD_W, CARD_H], [0, 0], 10, "Card body"), fill(C.bone)], "Card body"),
    ],
  });

  const shadow = shapeLayer({
    ind: 8,
    nm: "Shadow",
    op: OP,
    ks: {
      p: fixed([cx - half + 16, cy + 16, 0]),
      a: fixed([-half, 0, 0]),
      s: animated(
        [
          [0, [8, 100, 100]],
          [34, [100, 100, 100]],
        ],
        "out",
      ),
      o: animated(
        [
          [0, [0]],
          [10, [45]],
        ],
        "soft",
      ),
    },
    shapes: [group([rect([CARD_W, CARD_H], [0, 0], 10, "Shadow body"), fill(C.ground)], "Shadow body")],
  });

  const rule = (ind, y, width, stops, nm) =>
    shapeLayer({
      ind,
      nm,
      op: OP,
      ks: { p: fixed([cx, cy, 0]) },
      shapes: [
        group(
          [
            polyline(
              [
                [-210, y],
                [-210 + width, y],
              ],
              `${nm} path`,
            ),
            trim(stops),
            stroke(C.ground, 3, `${nm} stroke`, { opacity: 70 }),
          ],
          nm,
        ),
      ],
    });

  // Merkle leaf: a brass leaf outline with a tick through its vein.
  const merkleTick = shapeLayer({
    ind: 2,
    nm: "Merkle leaf",
    op: OP,
    ks: {
      p: fixed([812, 224, 0]),
      r: animated(
        [
          [80, [-14]],
          [94, [0]],
        ],
        "out",
      ),
      s: animated(
        [
          [80, [30, 30, 100]],
          [94, [112, 112, 100]],
          [104, [100, 100, 100]],
        ],
        "out",
      ),
      o: animated(
        [
          [80, [0]],
          [88, [100]],
        ],
        "soft",
      ),
    },
    shapes: [
      // The tick sits on top of the leaf outline.
      group(
        [
          polyline(
            [
              [-12, -26],
              [-1, -14],
              [14, -36],
            ],
            "Tick path",
          ),
          stroke(C.brass, 6, "Tick stroke"),
        ],
        "Tick",
      ),
      group(
        [
          // Two curved sides meet at a point top and bottom: a leaf, not a gem.
          path(
            [
              [0, 0, -24, -18, 24, -18],
              [0, -60, 24, 18, -24, 18],
            ],
            { closed: true, nm: "Leaf path" },
          ),
          stroke(C.brass, 4.5, "Leaf stroke"),
        ],
        "Leaf",
      ),
    ],
  });

  const stamp = shapeLayer({
    ind: 1,
    nm: "Stamp",
    op: OP,
    ks: {
      p: animated(
        [
          [112, [790, 300, 0]],
          [138, [790, 412, 0]],
        ],
        "in",
      ),
      r: fixed(-7),
      s: animated(
        [
          [112, [150, 150, 100]],
          [138, [96, 96, 100]],
          [148, [100, 100, 100]],
        ],
        "inOut",
      ),
      o: animated(
        [
          [112, [0]],
          [122, [100]],
        ],
        "soft",
      ),
    },
    shapes: [
      group([rect([250, 120], [0, 0], 6, "Stamp box"), stroke(C.vermilion, 7, "Stamp stroke")], "Stamp box"),
      group([ellipse([48, 48], [0, 0], "Stamp head"), stroke(C.vermilion, 3, "Head stroke")], "Stamp head"),
    ],
  });

  return doc({
    nm: "Pactwright receipt stitch",
    w: 1200,
    h: 600,
    op: OP,
    layers: [
      stamp,
      merkleTick,
      rule(6, 96, 300, [[58, [0]], [84, [100]]], "Rule 4"),
      rule(5, 40, 420, [[50, [0]], [76, [100]]], "Rule 3"),
      rule(4, -16, 360, [[40, [0]], [66, [100]]], "Rule 2"),
      rule(3, -56, 400, [[30, [0]], [56, [100]]], "Rule 1"),
      card,
      shadow,
    ],
  });
};

// ---------------------------------------------------------------------------
// Validation: palette, gradients, transforms, shape budget, byte budget.
// ---------------------------------------------------------------------------
const BUDGETS = {
  "seal-press.json": { bytes: 40 * 1024, shapes: 20 },
  "receipt-stitch.json": { bytes: 45 * 1024, shapes: 40 },
};

const nearestHex = (color) => {
  const channel = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return `#${[channel(color[0]), channel(color[1]), channel(color[2])]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;
};

const walk = (node, visit) => {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit);
  } else if (node && typeof node === "object") {
    visit(node);
    for (const value of Object.values(node)) walk(value, visit);
  }
};

const audit = (name, data, bytes) => {
  const allowed = new Set(Object.values(PALETTE));
  const colors = [];
  let geometry = 0;
  let gradients = 0;

  if (data.v !== SCHEMA_VERSION) throw new Error(`${name}: expected schema v${SCHEMA_VERSION}`);
  if (!Array.isArray(data.layers) || data.layers.length < 3) throw new Error(`${name}: needs 3+ layers`);

  for (const layer of data.layers) {
    for (const key of ["o", "r", "p", "a", "s"]) {
      const prop = layer.ks?.[key];
      if (!prop || !("k" in prop) || (prop.a !== 0 && prop.a !== 1)) {
        throw new Error(`${name}: layer "${layer.nm}" missing ks.${key}`);
      }
    }
  }

  walk(data, (node) => {
    if (node.ty === "gf" || node.ty === "gs" || node.ty === "gt") gradients += 1;
    if (node.ty === "rc" || node.ty === "el" || node.ty === "sh") geometry += 1;
    const c = node.c;
    if (c && Array.isArray(c.k) && c.k.length === 3 && c.k.every((v) => typeof v === "number")) {
      colors.push(c.k);
    }
  });

  if (gradients > 0) throw new Error(`${name}: gradient shapes are forbidden`);
  if (colors.length === 0) throw new Error(`${name}: no colours found`);
  for (const color of colors) {
    const hex = nearestHex(color);
    if (!allowed.has(hex)) throw new Error(`${name}: colour ${hex} is outside the brand palette`);
  }

  const budget = BUDGETS[name];
  if (!budget) throw new Error(`${name}: no budget configured`);
  if (geometry > budget.shapes) throw new Error(`${name}: ${geometry} shapes exceeds ${budget.shapes}`);
  if (bytes > budget.bytes) throw new Error(`${name}: ${bytes} bytes exceeds ${budget.bytes}`);

  return { geometry, colors: new Set(colors.map(nearestHex)).size };
};

// ---------------------------------------------------------------------------
// Write.
// ---------------------------------------------------------------------------
const main = () => {
  mkdirSync(OUT_DIR, { recursive: true });
  const outputs = [
    ["seal-press.json", sealPress()],
    ["receipt-stitch.json", receiptStitch()],
  ];

  for (const [name, data] of outputs) {
    const json = `${JSON.stringify(data, null, 2)}\n`;
    const bytes = Buffer.byteLength(json, "utf8");
    const { geometry, colors } = audit(name, data, bytes);
    // Fail loudly rather than shipping a file lottie-web would silently ignore.
    JSON.parse(json);

    const target = join(OUT_DIR, name);
    writeFileSync(target, json, "utf8");
    process.stdout.write(
      `wrote ${target} — ${bytes} bytes, ${data.w}x${data.h}, ${data.layers.length} layers, ` +
        `${geometry} shapes, ${colors} colours, ${data.op} frames @ ${data.fr}fps\n`,
    );
  }
};

try {
  main();
} catch (error) {
  process.stderr.write(`build-lottie failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
