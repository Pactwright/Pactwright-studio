import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards the generated Lottie files (apps/web/scripts/build-lottie.mjs) without
 * mounting React: lottie-web silently renders nothing for malformed data, so the
 * invariants a broken generator would violate are asserted here.
 */

const LOTTIE_DIR = path.resolve(__dirname, "../../public/lottie");

/** The only colours the brand allows in an animation, as #rrggbb. */
const BRAND_HEX = ["#e0505f", "#eeece9", "#d9a441", "#8fbf6d", "#12100e"];

type LottieProperty = { a?: number; k?: unknown };
type LottieKeyframe = { t: number; s?: number[]; i?: { x: number[]; y: number[] }; o?: { x: number[]; y: number[] } };
type LottieLayer = { ty: number; ind: number; nm: string; ks: Record<string, LottieProperty>; shapes: unknown[] };
type LottieFile = { v: unknown; fr: unknown; ip: unknown; op: unknown; w: unknown; h: unknown; layers: LottieLayer[] };

const files = [
  { name: "seal-press", w: 900, h: 900, fr: 60, op: 144, maxBytes: 40 * 1024, maxShapes: 20 },
  { name: "receipt-stitch", w: 1200, h: 600, fr: 60, op: 168, maxBytes: 45 * 1024, maxShapes: 40 },
] as const;

const raw = (name: string) => readFileSync(path.join(LOTTIE_DIR, `${name}.json`), "utf8");
const read = (name: string) => JSON.parse(raw(name)) as LottieFile;

const walk = (node: unknown, visit: (record: Record<string, unknown>) => void) => {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit);
  } else if (node && typeof node === "object") {
    const record = node as Record<string, unknown>;
    visit(record);
    for (const value of Object.values(record)) walk(value, visit);
  }
};

/** Every colour triple in the document, as 0..1 RGB. */
const collectColors = (data: LottieFile): number[][] => {
  const colors: number[][] = [];
  walk(data, (record) => {
    const c = record.c as { k?: unknown } | undefined;
    if (c && Array.isArray(c.k) && c.k.length === 3 && c.k.every((v) => typeof v === "number")) {
      colors.push(c.k as number[]);
    }
  });
  return colors;
};

const toHex = (color: number[]): string =>
  `#${color
    .map((channel) => Math.max(0, Math.min(255, Math.round(channel * 255))))
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;

/** Every animated property, keyed by its dotted path, for easing integrity. */
const collectAnimated = (
  node: unknown,
  at = "$",
  out: Array<{ at: string; keyframes: LottieKeyframe[] }> = [],
): Array<{ at: string; keyframes: LottieKeyframe[] }> => {
  if (Array.isArray(node)) {
    node.forEach((item, index) => collectAnimated(item, `${at}[${index}]`, out));
  } else if (node && typeof node === "object") {
    const record = node as Record<string, unknown>;
    if (record.a === 1 && Array.isArray(record.k)) {
      out.push({ at, keyframes: record.k as LottieKeyframe[] });
    } else {
      for (const [key, value] of Object.entries(record)) collectAnimated(value, `${at}.${key}`, out);
    }
  }
  return out;
};

describe.each(files)("$name.json", ({ name, w, h, fr, op, maxBytes, maxShapes }) => {
  const text = raw(name);
  const data = read(name);

  it("is valid JSON with the Lottie 5.13 envelope", () => {
    expect(() => JSON.parse(text)).not.toThrow();
    expect(data.v).toBe("5.13.0");
    expect(data.fr).toBe(fr);
    expect(data.ip).toBe(0);
    expect(data.op).toBe(op);
    expect(data.op).toBeGreaterThan(data.ip as number);
    expect(data.w).toBe(w);
    expect(data.h).toBe(h);
  });

  it("has at least three unique shape layers with a full transform", () => {
    expect(data.layers.length).toBeGreaterThanOrEqual(3);
    expect(new Set(data.layers.map((layer) => layer.ind)).size).toBe(data.layers.length);
    for (const layer of data.layers) {
      expect(layer.ty, `${layer.nm} is a shape layer`).toBe(4);
      for (const key of ["o", "r", "p", "a", "s"] as const) {
        const prop = layer.ks[key];
        expect(prop, `${layer.nm}.ks.${key}`).toBeTypeOf("object");
        expect(prop.a, `${layer.nm}.ks.${key}.a`).toBeTypeOf("number");
        expect(prop.k, `${layer.nm}.ks.${key}.k`).toBeDefined();
      }
      expect(Array.isArray(layer.shapes), `${layer.nm} has shapes`).toBe(true);
      expect(layer.shapes.length).toBeGreaterThan(0);
    }
  });

  it("only draws rc/el/sh primitives with the properties lottie-web needs", () => {
    let geometry = 0;
    walk(data, (record) => {
      if (record.ty === "rc") {
        geometry += 1;
        for (const key of ["p", "s", "r"]) expect(record[key], `rc.${key}`).toHaveProperty("k");
      } else if (record.ty === "el") {
        geometry += 1;
        for (const key of ["p", "s"]) expect(record[key], `el.${key}`).toHaveProperty("k");
      } else if (record.ty === "sh") {
        geometry += 1;
        const ks = record.ks as Record<string, unknown> | undefined;
        expect(ks, "sh.ks").toBeTypeOf("object");
        for (const key of ["i", "o", "v", "c"]) expect(ks, `sh.ks.${key}`).toHaveProperty("k");
      }
    });
    expect(geometry).toBeGreaterThan(0);
    expect(geometry).toBeLessThanOrEqual(maxShapes);
  });

  it("keyframes every animated property with matched easing arrays", () => {
    const animated = collectAnimated(data);
    expect(animated.length).toBeGreaterThan(0);
    for (const { at, keyframes } of animated) {
      expect(keyframes.length, `${at} has two or more keyframes`).toBeGreaterThanOrEqual(2);
      keyframes.forEach((frame, index) => {
        expect(Array.isArray(frame.s), `${at}[${index}].s`).toBe(true);
        const values = frame.s as number[];
        expect(values.length).toBeGreaterThan(0);
        expect(Number.isInteger(frame.t), `${at}[${index}].t`).toBe(true);
        if (index > 0) expect(frame.t, `${at} ascends in time`).toBeGreaterThan(keyframes[index - 1].t);
        for (const handle of [frame.i, frame.o]) {
          if (!handle) continue;
          expect(handle.x.length, `${at}[${index}] x handles`).toBe(values.length);
          expect(handle.y.length, `${at}[${index}] y handles`).toBe(values.length);
        }
      });
      // Every segment but the last shapes its curve with in/out handles.
      for (const frame of keyframes.slice(0, -1)) {
        expect(frame.i, `${at} has in-handles`).toBeTypeOf("object");
        expect(frame.o, `${at} has out-handles`).toBeTypeOf("object");
      }
    }
  });

  it("uses only brand colours", () => {
    const colors = collectColors(data);
    expect(colors.length).toBeGreaterThan(0);
    for (const color of colors) {
      for (const channel of color) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(1);
      }
      expect(BRAND_HEX, `rgb(${color.join(", ")}) → ${toHex(color)}`).toContain(toHex(color));
    }
  });

  it("contains no gradients", () => {
    expect(text).not.toMatch(/"ty"\s*:\s*"g[fs]t?"/);
    walk(data, (record) => {
      expect(record.ty, "gradient shape types").not.toBe("gf");
      expect(record.ty, "gradient shape types").not.toBe("gs");
      expect(record.ty, "gradient shape types").not.toBe("gt");
    });
  });

  it("stays inside its byte budget", () => {
    const bytes = statSync(path.join(LOTTIE_DIR, `${name}.json`)).size;
    expect(bytes).toBe(Buffer.byteLength(text, "utf8"));
    expect(bytes).toBeLessThan(maxBytes);
  });
});
