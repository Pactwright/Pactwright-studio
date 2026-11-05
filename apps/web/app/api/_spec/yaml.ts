/**
 * The emitter behind `docs/openapi.yaml`. #83.
 *
 * The document is generated from `openapi.ts` rather than written by hand because a hand-written YAML and
 * the handlers it describes drift apart silently — the tests read the object, so only an object the file is
 * emitted from can be checked against them. No dependency is involved: the issue rules one out, and the
 * grammar needed here is small (mappings, sequences, scalars), so it is written out instead of installed.
 *
 * Two rules keep it honest:
 * - Output is a pure function of the value and of each object's key order, so the same spec always produces
 *   the same bytes and a diff of the file is a diff of the contract.
 * - Anything that is not safely readable as a plain YAML scalar is double-quoted with JSON escapes, and
 *   long prose is folded into a block scalar. Ambiguous strings (`true`, `1`, `null`) are quoted too, so a
 *   value can never change type by passing through the document.
 */

const STEP = 2;
/** A sequence of scalars this short stays on one line; a longer one goes under its key. */
const FLOW_MAX = 68;
/** Prose longer than this is folded onto several lines instead of one unreadable one. */
const FOLD_MIN = 72;
/** Aim for content that fits a review diff without horizontal scrolling. */
const LINE_WIDTH = 96;

/** Words YAML would read as something else, so they have to be quoted to stay strings. */
const AMBIGUOUS = new Set(["true", "false", "null", "yes", "no", "on", "off", "~", "", "-"]);

function isMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEmpty(value: unknown): boolean {
  if (Array.isArray(value)) return value.length === 0;
  if (isMapping(value)) return Object.keys(value).length === 0;
  return false;
}

function isScalar(value: unknown): boolean {
  return value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function pad(indent: number): string {
  return " ".repeat(indent);
}

/**
 * A string that can stand alone after its key with no quotes: no leading or trailing space, no `#` or `: `
 * (which start a comment or end a key), no quote or flow indicator, not a number or a boolean word, and no
 * control character. Everything else goes through `quote`.
 */
function isPlain(text: string): boolean {
  if (AMBIGUOUS.has(text.toLowerCase())) return false;
  if (/^\s|\s$/.test(text)) return false;
  if (/[\u0000-\u001f\u007f]/.test(text)) return false;
  if (/["'\\]/.test(text)) return false;
  if (/[,[\]{}&*!|>%@`]/.test(text)) return false;
  if (/[:#](\s|$)/.test(text)) return false;
  if (/^[?:#-]/.test(text)) return false;
  if (/\s\s/.test(text)) return false;
  if (/^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(text)) return false;
  return true;
}

/** JSON's escapes are a subset of YAML's double-quoted ones, so `JSON.stringify` is enough. */
function quote(text: string): string {
  return JSON.stringify(text);
}

function scalarToken(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return isPlain(value) ? value : quote(value);
  return String(value);
}

/** Foldable: long, breakable at a space, and with nothing a folded block scalar would reinterpret. */
function foldWorthy(text: string): boolean {
  return (
    text.length > FOLD_MIN &&
    text.includes(" ") &&
    !/[\u0000-\u001f\u007f]/.test(text) &&
    !/^\s|\s$/.test(text) &&
    !/\s\s/.test(text)
  );
}

/** Greedy word wrap. Each break becomes one space when the block is read back, so nothing is lost. */
function wrap(text: string, width: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (line.length > 0 && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line.length === 0 ? word : `${line} ${word}`;
    }
  }
  if (line.length > 0) lines.push(line);
  return lines;
}

function pushFolded(text: string, indent: number, lines: string[]): void {
  for (const line of wrap(text, Math.max(24, LINE_WIDTH - indent))) lines.push(`${pad(indent)}${line}`);
}

function flowSequence(items: unknown[]): string {
  return `[${items.map(scalarToken).join(", ")}]`;
}

function allScalars(items: unknown[]): boolean {
  return items.every((item) => isScalar(item) && !isEmpty(item));
}

function pushSequence(items: unknown[], indent: number, lines: string[]): void {
  const dash = `${pad(indent)}- `;
  for (const item of items) {
    if (isEmpty(item)) {
      lines.push(dash + (Array.isArray(item) ? "[]" : "{}"));
      continue;
    }
    if (Array.isArray(item) || isMapping(item)) {
      // Render the item one level deeper, then hang its first line off the dash: `- name: id`.
      const inner: string[] = [];
      pushNode(item, indent + STEP, inner);
      lines.push(dash + inner[0].slice(indent + STEP), ...inner.slice(1));
      continue;
    }
    // A folded scalar has no place in a sequence this document uses; a quoted one-line value stays readable.
    lines.push(dash + scalarToken(item));
  }
}

function pushMapping(obj: Record<string, unknown>, indent: number, lines: string[]): void {
  for (const [rawKey, value] of Object.entries(obj)) {
    const key = isPlain(rawKey) ? rawKey : quote(rawKey);
    const head = `${pad(indent)}${key}:`;
    if (isEmpty(value)) {
      lines.push(`${head} ${Array.isArray(value) ? "[]" : "{}"}`);
      continue;
    }
    if (Array.isArray(value)) {
      if (allScalars(value) && flowSequence(value).length + indent <= FLOW_MAX) {
        lines.push(`${head} ${flowSequence(value)}`);
      } else {
        lines.push(`${head}`);
        pushSequence(value, indent + STEP, lines);
      }
      continue;
    }
    if (isMapping(value)) {
      lines.push(`${head}`);
      pushMapping(value, indent + STEP, lines);
      continue;
    }
    if (typeof value === "string" && foldWorthy(value)) {
      lines.push(`${head} >-`);
      pushFolded(value, indent + STEP, lines);
      continue;
    }
    lines.push(`${head} ${scalarToken(value)}`);
  }
}

function pushNode(value: unknown, indent: number, lines: string[]): void {
  if (Array.isArray(value)) {
    pushSequence(value, indent, lines);
    return;
  }
  if (isMapping(value)) {
    pushMapping(value, indent, lines);
    return;
  }
  throw new TypeError(`openapi.yaml: expected a mapping or a sequence at indent ${indent}, got ${typeof value}`);
}

/** Render a JSON-shaped value as the YAML subset this repository's document uses. */
export function toYaml(document: unknown): string {
  const lines: string[] = [];
  if (Array.isArray(document) || isMapping(document)) pushNode(document, 0, lines);
  else lines.push(scalarToken(document));
  return `${lines.join("\n")}\n`;
}
