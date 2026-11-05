/**
 * A reader for the YAML `app/api/_spec/yaml.ts` writes — nothing more. #83.
 *
 * It exists because the published document is only evidence if it can be read back: comparing the checked-in
 * file with the emission proves the file is current, but not that the text says what the object means. This
 * parses the emitted grammar and the test deep-compares the result with `openApiSpec`, so a quoting bug that
 * made a description lose a sentence, or a folded line that YAML would join with a different separator,
 * shows up as a mismatch rather than as a published document nobody can read. No YAML package is installed
 * (the issue rules out a new dependency), so the reader is deliberately as narrow as the emitter: mappings,
 * block and flow sequences, plain/quoted/folded scalars.
 */

export function fromYaml(text: string): unknown {
  const lines = text.split("\n");
  let cursor = 0;

  const indentOf = (line: string) => {
    if (/^\t/.test(line)) throw new Error("tabs are not the emitted grammar");
    return /^ */.exec(line)![0].length;
  };
  const isBlank = (line: string) => line.trim() === "";
  const isComment = (line: string) => line.trim().startsWith("#");

  function nextStructural(): { indent: number; text: string; index: number } | null {
    while (cursor < lines.length && (isBlank(lines[cursor]) || isComment(lines[cursor]))) cursor++;
    if (cursor >= lines.length) return null;
    const raw = lines[cursor];
    return { indent: indentOf(raw), text: raw.slice(indentOf(raw)), index: cursor };
  }

  function decodeQuoted(token: string): string {
    if (!token.startsWith('"')) throw new Error(`not a quoted scalar: ${token}`);
    try {
      return JSON.parse(token) as string;
    } catch {
      throw new Error(`bad quoted scalar: ${token}`);
    }
  }

  /** Where the closing quote of a quoted token ends, skipping escaped quotes. */
  function quotedEnd(text: string): number {
    for (let i = 1; i < text.length; i++) {
      if (text[i] === "\\") {
        i++;
        continue;
      }
      if (text[i] === '"') return i + 1;
    }
    return -1;
  }

  function splitKey(text: string): { key: string; rest: string } | null {
    if (text.startsWith('"')) {
      const end = quotedEnd(text);
      if (end < 0 || text[end] !== ":") return null;
      return { key: decodeQuoted(text.slice(0, end)), rest: text.slice(end + 1).trim() };
    }
    const match = /^([^:]+):( |$)(.*)$/.exec(text);
    if (!match) return null;
    return { key: match[1], rest: match[3].trim() };
  }

  function scalar(token: string): unknown {
    if (token.startsWith('"')) return decodeQuoted(token);
    if (token === "null") return null;
    if (token === "true") return true;
    if (token === "false") return false;
    if (/^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(token)) return Number(token);
    return token;
  }

  function flowSequence(token: string): unknown[] {
    if (!token.startsWith("[") || !token.endsWith("]")) throw new Error(`not a flow sequence: ${token}`);
    const inner = token.slice(1, -1).trim();
    if (inner === "") return [];
    const parts: string[] = [];
    let depth = 0;
    let inQuotes = false;
    let current = "";
    for (let i = 0; i < inner.length; i++) {
      const ch = inner[i];
      if (ch === "\\" && inQuotes) {
        current += ch + (inner[i + 1] ?? "");
        i++;
        continue;
      }
      if (ch === '"') inQuotes = !inQuotes;
      if (!inQuotes && (ch === "[" || ch === "{")) depth++;
      if (!inQuotes && (ch === "]" || ch === "}")) depth--;
      if (!inQuotes && ch === "," && depth === 0) {
        parts.push(current.trim());
        current = "";
        continue;
      }
      current += ch;
    }
    parts.push(current.trim());
    return parts.map(scalar);
  }

  /** The folded block under a `key: >-` line: content is deeper than the key, and folds back with spaces. */
  function folded(parentIndent: number): string {
    while (cursor < lines.length && isBlank(lines[cursor])) cursor++;
    if (cursor >= lines.length) throw new Error("a folded scalar with no content");
    const childIndent = indentOf(lines[cursor]);
    if (childIndent <= parentIndent) throw new Error("folded content is not indented past its key");
    const parts: string[] = [];
    while (cursor < lines.length) {
      const raw = lines[cursor];
      if (isBlank(raw)) {
        parts.push("");
        cursor++;
        continue;
      }
      if (indentOf(raw) < childIndent) break;
      parts.push(raw.slice(childIndent));
      cursor++;
    }
    while (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
    return parts.join(" ");
  }

  function parseInline(token: string, keyIndent: number): unknown {
    if (token === "{}") return {};
    if (token === "[]") return [];
    if (token.startsWith("[")) return flowSequence(token);
    if (token.startsWith("{")) {
      throw new Error(`the emitted grammar has no flow mappings: ${token}`);
    }
    if (token === ">-" || token === ">") return folded(keyIndent);
    return scalar(token);
  }

  function parseMapping(indent: number): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (;;) {
      const line = nextStructural();
      if (!line || line.indent < indent || line.text.startsWith("- ")) break;
      if (line.indent > indent) throw new Error(`unexpected indent on line ${line.index + 1}: ${line.text}`);
      cursor = line.index + 1;
      const split = splitKey(line.text);
      if (!split) throw new Error(`not a key/value line on ${line.index + 1}: ${line.text}`);
      if (split.rest === "") {
        const child = nextStructural();
        if (!child || child.indent <= indent) throw new Error(`a block value is missing under ${split.key}`);
        out[split.key] = parseBlock(child.indent);
      } else {
        out[split.key] = parseInline(split.rest, indent);
      }
    }
    return out;
  }

  function parseSequence(indent: number): unknown[] {
    const items: unknown[] = [];
    for (;;) {
      const line = nextStructural();
      if (!line || line.indent < indent) break;
      if (line.indent > indent) throw new Error(`unexpected indent on line ${line.index + 1}`);
      if (!line.text.startsWith("- ")) break;
      const after = line.text.slice(2);
      if (after.trim() === "") {
        cursor = line.index + 1;
        const child = nextStructural();
        if (!child || child.indent <= indent) throw new Error(`an empty sequence item on line ${line.index + 1}`);
        items.push(parseBlock(child.indent));
        continue;
      }
      if (splitKey(after)) {
        // `- name: id` is a mapping whose first key sits on the dash: rewrite it as an indented key line.
        lines[line.index] = " ".repeat(indent + 2) + after;
        cursor = line.index;
        items.push(parseMapping(indent + 2));
        continue;
      }
      cursor = line.index + 1;
      items.push(parseInline(after, indent));
    }
    return items;
  }

  function parseBlock(indent: number): unknown {
    const line = nextStructural();
    if (!line) throw new Error("the document ended in the middle of a block");
    if (line.indent !== indent) throw new Error(`inconsistent indent on line ${line.index + 1}`);
    return line.text.startsWith("- ") ? parseSequence(indent) : parseMapping(indent);
  }

  const root = parseBlock(0);
  const trailing = nextStructural();
  if (trailing) throw new Error(`content after the document ended on line ${trailing.index + 1}`);
  return root;
}
