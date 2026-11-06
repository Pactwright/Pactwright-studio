/**
 * #93: a page that failed still has to give the visitor somewhere to go, and a page that failed on the
 * server must not repeat what the server said.
 *
 * Both pages are checked as rendered output rather than as source: every link is re-resolved against the
 * `page.tsx` files actually on disk (a renamed route fails here), the Retry button's own `onClick` is
 * called with a spy, the digest is read back out of the tree, and the error object carries a connection
 * string in its `message` and a real stack in its `stack` so an assertion that either appears anywhere in
 * the output — text or attribute — is a leak. The one thing a node test cannot do is run React's effect
 * for real, so `useEffect` is captured and invoked, which puts the browser-console line under the same
 * leak check as the page.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";

// `error.tsx` is a client component; calling it as a plain function would break React's hook rules. The
// effect is captured instead of scheduled, so the render is a tree this file can read and the log line is
// a function this file can call.
const capturedEffects: Array<() => void> = [];
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return {
    ...react,
    useEffect: (fn: () => void) => {
      capturedEffects.push(fn);
    },
  };
});

import ErrorBoundary from "@/app/error";
import NotFound from "@/app/not-found";

const HERE = dirname(fileURLToPath(import.meta.url));
const ERROR_SRC = readFileSync(join(HERE, "../../app/error.tsx"), "utf8");
const CSS = readFileSync(join(HERE, "../../app/globals.css"), "utf8");

/** What a server-side failure looks like when it is not filtered: a message with the credential in it. */
const SECRET_MESSAGE = "connect to postgres://pactwright:hunter2@db.internal:5432/pactwright failed";
const SECRET_STACK = `Error: ${SECRET_MESSAGE}\n    at Connection.connect (/app/node_modules/pg/lib/connection.js:121:17)`;
const DIGEST = "7f3a19c4e0";

type El = ReactElement<{ children?: ReactNode } & Record<string, unknown>>;

function isElement(node: ReactNode): node is El {
  return typeof node === "object" && node !== null && "type" in node && "props" in node;
}

/** Every host element in the tree, in document order. */
function elements(node: ReactNode): El[] {
  const out: El[] = [];
  const visit = (n: ReactNode) => {
    if (Array.isArray(n)) return n.forEach(visit);
    if (!isElement(n)) return;
    if (typeof n.type === "string") out.push(n);
    visit(n.props.children);
  };
  visit(node);
  return out;
}

/** Text inside an element, with the JSX whitespace separators joined into single spaces. */
function textOf(node: ReactNode): string {
  const parts: string[] = [];
  const visit = (n: ReactNode) => {
    if (typeof n === "string" || typeof n === "number") parts.push(String(n));
    else if (Array.isArray(n)) n.forEach(visit);
    else if (isElement(n)) visit(n.props.children);
  };
  visit(node);
  return parts.join("").replace(/\s+/g, " ").trim();
}

/** Every string the component emits: text nodes and attribute values alike. */
function allStrings(node: ReactNode): string {
  const parts: string[] = [];
  for (const el of elements(node)) {
    for (const [key, value] of Object.entries(el.props)) {
      if (key !== "children" && typeof value === "string") parts.push(value);
    }
  }
  return `${parts.join("\n")}\n${textOf(node)}`;
}

function links(node: ReactNode) {
  return elements(node)
    .filter((el) => el.type === "a")
    .map((el) => ({ href: String(el.props.href ?? ""), label: textOf(el) }));
}

/** Routes Studio serves: one per `page.tsx`, route groups stripped, dynamic segments left out. */
function servedRoutes(): string[] {
  const out: string[] = [];
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name === "api") continue;
      const segment = entry.name.startsWith("(") ? "" : `/${entry.name}`;
      walk(join(dir, entry.name), prefix + segment);
    }
    if (readdirSync(dir).includes("page.tsx")) out.push(prefix || "/");
  };
  walk(join(HERE, "../../app"), "");
  return out.filter((r) => !r.includes("[")).sort();
}

function errorPage(error: Error & { digest?: string }, reset = vi.fn()) {
  capturedEffects.length = 0;
  const tree = ErrorBoundary({ error, reset });
  return { tree, reset };
}

const serverError = (digest?: string) =>
  Object.assign(new Error(SECRET_MESSAGE), digest ? { digest } : {}, { stack: SECRET_STACK });

describe("#93 the not-found page", () => {
  it("points the visitor at the pact lookup, the ledger and the certificate viewer", () => {
    const hrefs = links(NotFound()).map((l) => l.href);
    expect(new Set(hrefs)).toEqual(new Set(["/", "/pacts", "/verify"]));
    for (const link of links(NotFound())) expect(link.label.length).toBeGreaterThan(0);
  });

  it("links only routes Studio serves", () => {
    for (const href of links(NotFound()).map((l) => l.href)) expect(servedRoutes()).toContain(href);
  });

  it("styles every class it uses, so the links are not the only thing missing", () => {
    for (const el of elements(NotFound())) {
      for (const cls of String(el.props.className ?? "").split(/\s+/).filter(Boolean)) {
        expect(CSS).toMatch(new RegExp(`\\.${cls}\\b`)); // the failing regex names the class
      }
    }
  });

  it("renders no stack frame or technical identifier", () => {
    expect(allStrings(NotFound())).not.toMatch(/at .+ \(.+:\d+:\d+\)/);
  });
});

describe("#93 the error page", () => {
  it("keeps the retry button wired to reset()", () => {
    const { tree, reset } = errorPage(serverError(DIGEST));
    const buttons = elements(tree).filter((el) => el.type === "button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].props.type).toBe("button"); // not "submit": there is no form to submit
    expect(textOf(buttons[0]).length).toBeGreaterThan(0);
    (buttons[0].props.onClick as () => void)();
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("shows the digest as quotable text", () => {
    const tree = errorPage(serverError(DIGEST)).tree;
    const code = elements(tree).filter((el) => el.type === "code");
    expect(code.map(textOf)).toEqual([DIGEST]);
    expect(textOf(tree)).toContain(DIGEST);
  });

  it("says nothing about a reference when the error has no digest", () => {
    const tree = errorPage(serverError()).tree;
    expect(elements(tree).filter((el) => el.type === "code")).toHaveLength(0);
    expect(textOf(tree)).not.toMatch(/reference/i);
  });

  it("renders neither the server message nor its stack", () => {
    for (const tree of [errorPage(serverError(DIGEST)).tree, errorPage(serverError()).tree]) {
      const out = allStrings(tree);
      expect(out).not.toContain(SECRET_MESSAGE);
      expect(out).not.toContain(SECRET_STACK);
      expect(out).not.toContain("hunter2");
      expect(out).not.toContain("db.internal");
      expect(out).not.toMatch(/at .+ \(.+:\d+:\d+\)/);
    }
  });

  it("keeps the server message out of the browser console as well", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    errorPage(serverError(DIGEST));
    capturedEffects.forEach((fn) => fn());
    const emitted = logged.mock.calls.map((call) => call.join(" ")).join("\n");
    logged.mockRestore();
    expect(emitted).not.toContain(SECRET_MESSAGE);
    expect(emitted).not.toContain(SECRET_STACK);
    expect(emitted).toContain(DIGEST);
  });

  it("is a client component, or the retry button is inert", () => {
    expect(ERROR_SRC.startsWith('"use client";')).toBe(true);
  });

  it("announces itself, and links the same three ways forward as the 404", () => {
    const tree = errorPage(serverError(DIGEST)).tree;
    expect(elements(tree).filter((el) => el.props.role === "alert").length).toBeGreaterThan(0);
    const hrefs = new Set(links(tree).map((l) => l.href));
    expect(hrefs).toEqual(new Set(["/", "/pacts", "/verify"]));
    for (const href of hrefs) expect(servedRoutes()).toContain(href);
  });

  it("styles every class it uses", () => {
    for (const el of elements(errorPage(serverError(DIGEST)).tree)) {
      for (const cls of String(el.props.className ?? "").split(/\s+/).filter(Boolean)) {
        expect(CSS).toMatch(new RegExp(`\\.${cls}\\b`)); // the failing regex names the class
      }
    }
  });
});
