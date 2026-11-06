/**
 * #86: `/verify` takes a certificate from a file as well as from the paste box, the file is read in
 * this browser and never uploaded, and the Node-crypto module #89's budget found on this page's
 * critical path is loaded on demand.
 *
 * The component is driven as a tree, the way `error-pages.test.ts` drives the failure pages:
 * `useState` is backed by cells this file owns and `useEffect` is captured and flushed, so a chosen
 * file goes through the real handler, the real parser and the real `lib/verify`, and what a visitor
 * would see is read out of the output. A spy on `File.prototype.text` proves a rejected file is never
 * even read from disk, and a spy on `fetch` proves a certificate that is not anchored never leaves
 * the browser.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";

const cells: unknown[] = [];
const effects: Array<() => unknown> = [];
let cursor = 0;
let props: { initialCertificate?: unknown } = {};
let tree: ReactNode = null;

vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return {
    ...react,
    // The hook order is fixed for this component, so a cell per call site is enough to hold state
    // between the renders this file drives by hand.
    useState: (init: unknown) => {
      const i = cursor++;
      if (cells.length <= i) cells[i] = typeof init === "function" ? (init as () => unknown)() : init;
      const set = (next: unknown) => {
        cells[i] = typeof next === "function" ? (next as (prev: unknown) => unknown)(cells[i]) : next;
      };
      return [cells[i], set];
    },
    // React would schedule these; this file runs them, so the dynamic import and the on-chain probe
    // are under the same test as the markup.
    useEffect: (fn: () => unknown) => {
      effects.push(fn);
    },
  };
});

// Every call of these two is one time the browser had to load `lib/verify` and the Node crypto
// polyfill behind it. Counting the calls, not the module, lets a certificate with nothing to hash be
// proven to cost no crypto at all — which is what #89's `/verify` margin turned on.
const cryptoLoad = vi.hoisted(() => ({ times: 0 }));
vi.mock("@/lib/verify", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/verify")>();
  return {
    ...actual,
    verifyReceipt: (...args: Parameters<typeof actual.verifyReceipt>) => {
      cryptoLoad.times += 1;
      return actual.verifyReceipt(...args);
    },
    computeReceiptLeaf: (...args: Parameters<typeof actual.computeReceiptLeaf>) => {
      cryptoLoad.times += 1;
      return actual.computeReceiptLeaf(...args);
    },
  };
});

import {
  CertificateCard,
  MAX_CERT_BYTES,
  fileProblem,
  parseCertificate,
  readCertificateFile,
  verifyOffline,
  type CertificateData,
} from "@/components/CertificateCard";
import { computeReceiptLeaf } from "@/lib/verify";

const HERE = dirname(fileURLToPath(import.meta.url));
const CARD_SRC = readFileSync(join(HERE, "../../components/CertificateCard.tsx"), "utf8");

/** A receipt whose leaf really does hash up to that root, as `test/e2e/verify.spec.ts` uses it. */
const LEAF = "1111111111111111111111111111111111111111111111111111111111111111";
const ROOT = "5189c77d29fe5d546a045ec46986852785fea5c13ac7da9c115ff5fb6edf817c";
const SIBLING = "2222222222222222222222222222222222222222222222222222222222222222";
const PACT_ID = "1111111111111111111111111111111111111111111111111111111111111111";

const goodCert = {
  pactId: PACT_ID,
  transition: "settled",
  toSeller: "10.0000000",
  toBuyer: "0.0000000",
  status: "pending",
  leaf: LEAF,
  root: ROOT,
  proof: [SIBLING],
};

/** A certificate whose `leafInput` no longer describes the leaf it carries. */
const tamperedCert = {
  ...goodCert,
  leaf: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  leafInput: {
    transition: "settled",
    toSellerStroops: "100000000",
    toBuyerStroops: "0",
    envelopeHash: null,
    ledger: 100,
  },
};

function certFile(text: string, name = "certificate.json"): File {
  return new File([text], name, { type: "application/json" });
}

type El = ReactElement<{ children?: ReactNode } & Record<string, unknown>>;

function isElement(node: ReactNode): node is El {
  return typeof node === "object" && node !== null && "type" in node && "props" in node;
}

function elements(node: ReactNode, out: El[] = []): El[] {
  if (Array.isArray(node)) {
    for (const child of node) elements(child, out);
    return out;
  }
  if (!isElement(node)) return out;
  if (typeof node.type === "string") out.push(node);
  elements(node.props.children, out);
  return out;
}

function textOf(node: ReactNode): string {
  const parts: string[] = [];
  const visit = (n: ReactNode) => {
    if (typeof n === "string" || typeof n === "number") parts.push(String(n));
    else if (Array.isArray(n)) n.forEach(visit);
    else if (isElement(n)) visit(n.props.children);
  };
  visit(node);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function render(): void {
  cursor = 0;
  effects.length = 0;
  tree = CertificateCard(props as { initialCertificate?: CertificateData });
}

/** Run the captured effects, let their promises land, and render what the state now says. */
async function settle(rounds = 4): Promise<ReactNode> {
  for (let round = 0; round < rounds; round++) {
    const pending = effects.splice(0, effects.length);
    for (const fn of pending) void fn();
    await new Promise((resolve) => setTimeout(resolve, 0));
    render();
  }
  return tree;
}

function fileInput(): El {
  const input = elements(tree).find((el) => el.props.id === "certificate-file");
  if (!input) throw new Error("the page has no certificate file input");
  return input;
}

function chooseFiles(files: File[]): Promise<void> {
  const handler = fileInput().props.onChange as (event: unknown) => void;
  handler({ target: { files, value: "C:\\fakepath\\certificate.json" } });
  return settle().then(() => undefined);
}

function dropFiles(files: File[]): Promise<void> {
  const zone = elements(tree).find((el) => typeof el.props.onDrop === "function");
  if (!zone) throw new Error("the page has no drop zone");
  let prevented = false;
  (zone.props.onDrop as (event: unknown) => void)({
    preventDefault: () => {
      prevented = true;
    },
    dataTransfer: { files },
  });
  expect(prevented, "a dropped file must not navigate the page away").toBe(true);
  return settle().then(() => undefined);
}

function note(): El | undefined {
  return elements(tree).find((el) => el.props.id === "certificate-file-note");
}

/** Mount from scratch, so a test that needs `initialCertificate` does not inherit the previous cells. */
function mount(p: { initialCertificate?: unknown }): Promise<ReactNode> {
  cells.length = 0;
  props = p;
  render();
  return settle();
}

/** Handlers are re-read from the current tree each time: an old closure sees the old state. */
function clickInspect(): Promise<void> {
  const button = elements(tree).find((el) => el.type === "button" && textOf(el) === "Inspect & Verify") as El;
  (button.props.onClick as () => void)();
  return settle().then(() => undefined);
}

function typeIntoBox(value: string): Promise<void> {
  const box = elements(tree).find((el) => el.props.id === "certificate-json") as El;
  (box.props.onChange as (event: unknown) => void)({ target: { value } });
  return settle().then(() => undefined);
}

function badge(): string {
  const el = elements(tree).find((node) => node.props["data-testid"] === "verification-badge");
  if (!el) throw new Error("no verification badge in the output");
  return textOf(el);
}

let fetches: string[] = [];
let reads: number;

beforeEach(() => {
  cells.length = 0;
  props = {};
  fetches = [];
  reads = 0;
  cryptoLoad.times = 0;
  render();
  vi.spyOn(globalThis, "fetch").mockImplementation((input: unknown) => {
    fetches.push(String(input));
    return Promise.resolve(new Response("{}", { status: 200 })) as never;
  });
  const text = File.prototype.text;
  vi.spyOn(File.prototype, "text").mockImplementation(function (this: File) {
    reads += 1;
    return text.call(this);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("#86 a chosen file is only a certificate if it is one .json of a sane size", () => {
  it("accepts one .json file at or under the limit", () => {
    expect(fileProblem([certFile(JSON.stringify(goodCert))] as File[])).toBeNull();
    expect(fileProblem([new File(["{}"], "UPPER.JSON")] as File[])).toBeNull();
    expect(fileProblem([new File(["x".repeat(MAX_CERT_BYTES)], "exact.json")] as File[])).toBeNull();
  });

  it("rejects a second file, and counts what was given", () => {
    const message = fileProblem([certFile("{}"), certFile("{}")] as File[]);
    expect(message).toMatch(/One certificate at a time/);
    expect(message).toContain("2 files");
  });

  it("rejects something that is not a .json file by name", () => {
    const message = fileProblem([new File(["{}"], "certificate.txt")]);
    expect(message).toContain("certificate.txt");
    expect(message).toMatch(/isn't a \.json file/);
  });

  it("names both sizes when the file is over the limit", () => {
    const big = new File(["x".repeat(MAX_CERT_BYTES + 1)], "huge.json");
    const message = fileProblem([big]) as string;
    expect(message).toContain("huge.json");
    expect(message).toMatch(/257 KiB/);
    expect(message).toMatch(/at most 256 KiB/);
  });

  it("says so when nothing was chosen", () => {
    expect(fileProblem([])).toMatch(/Nothing was chosen/);
  });

  it("measures the limit in bytes, not in characters", () => {
    // 256 KiB of two-byte characters is over half a megabyte on disk.
    const wide = new File([new Uint8Array(MAX_CERT_BYTES)], "wide.json");
    expect(wide.size).toBe(MAX_CERT_BYTES);
    expect(fileProblem([wide])).toBeNull();
  });
});

describe("#86 the parse error is a sentence, not an exception", () => {
  it("parses a certificate", () => {
    const result = parseCertificate(JSON.stringify(goodCert));
    expect(result.error).toBeNull();
    expect(result.certificate?.leaf).toBe(LEAF);
  });

  it("handles an empty box without throwing", () => {
    expect(parseCertificate("   ").error).toMatch(/no certificate here yet/);
  });

  it("calls a truncated file what it is", () => {
    const result = parseCertificate(JSON.stringify(goodCert).slice(0, 40));
    expect(result.certificate).toBeNull();
    expect(result.error).toMatch(/isn't valid JSON/);
  });

  it("refuses a JSON list and a JSON scalar, which used to reach the leaf check", () => {
    for (const text of ["[1,2,3]", '"just a string"', "42", "null", "true"]) {
      const result = parseCertificate(text);
      expect(result.certificate, text).toBeNull();
      expect(result.error, text).toMatch(/one JSON object/);
    }
  });

  it("names what is missing from a near-miss object", () => {
    expect(parseCertificate(JSON.stringify({ pactId: PACT_ID })).error).toMatch(/missing its pactId or leaf/);
    expect(parseCertificate(JSON.stringify({ leaf: LEAF })).error).toMatch(/missing its pactId or leaf/);
  });
});

describe("#86 reading the file does not send it anywhere", () => {
  it("reads the text in place", async () => {
    const result = await readCertificateFile(certFile('{"leaf":"abc"}'));
    expect(result.error).toBeNull();
    expect(result.text).toBe('{"leaf":"abc"}');
    expect(fetches).toEqual([]);
  });

  it("is the only thing a chosen file touches before parsing", async () => {
    await chooseFiles([certFile(JSON.stringify(goodCert))]);
    expect(fetches, `a pending certificate must not make any request: ${fetches.join(", ")}`).toEqual([]);
  });

  it("never reads a file it already rejected", async () => {
    await chooseFiles([new File(["x".repeat(MAX_CERT_BYTES + 1)], "huge.json")]);
    expect(reads, "an over-limit file should be rejected from its size alone").toBe(0);
    expect(fetches).toEqual([]);
  });
});

describe("#86 the offline check is the same check, loaded when it is needed", () => {
  it("verifies a real leaf against its root", async () => {
    const { verification, error } = await verifyOffline(goodCert as CertificateData);
    expect(error).toBeNull();
    expect(verification?.offlineVerified).toBe(true);
    expect(verification?.leafMismatch).toBe(false);
  });

  it("rejects a proof that does not reach the root", async () => {
    const { verification } = await verifyOffline({ ...goodCert, root: SIBLING } as CertificateData);
    expect(verification?.offlineVerified).toBe(false);
  });

  it("flags a certificate whose leaf its own inputs do not produce", async () => {
    const { verification } = await verifyOffline(tamperedCert as CertificateData);
    expect(verification?.leafMismatch).toBe(true);
    expect(verification?.recomputedLeaf).toMatch(/^[0-9a-f]{64}$/);
    expect(verification?.recomputedLeaf).not.toBe(tamperedCert.leaf);
  });

  it("loads no crypto at all for a certificate with nothing to hash", async () => {
    const { verification } = await verifyOffline({ pactId: PACT_ID, leaf: LEAF } as unknown as CertificateData);
    expect(verification).toEqual({ offlineVerified: false, leafMismatch: false, recomputedLeaf: null });
    expect(cryptoLoad.times, "a certificate with no root and no leafInput must not reach for node:crypto").toBe(0);
  });

  it("compares the digest as bytes, not as the case or padding it was pasted in", async () => {
    const expected = computeReceiptLeaf({
      pactId: PACT_ID,
      transition: "settled",
      toSeller: "100000000",
      toBuyer: "0",
      envelopeHash: null,
      ledger: 100,
    });
    const padded = {
      ...goodCert,
      leaf: ` ${expected.toUpperCase()} `,
      leafInput: {
        transition: "settled",
        toSellerStroops: "100000000",
        toBuyerStroops: "0",
        envelopeHash: null,
        ledger: 100,
      },
    };
    const { verification } = await verifyOffline(padded as unknown as CertificateData);
    expect(verification?.leafMismatch, "an upper-case leaf is the same digest").toBe(false);
    // The same certificate with one amount changed still has to fail.
    const altered = { ...padded, leafInput: { ...padded.leafInput, toSellerStroops: "200000000" } };
    const second = await verifyOffline(altered as unknown as CertificateData);
    expect(second.verification?.leafMismatch).toBe(true);
  });

  it("is not imported statically anywhere in the client graph", () => {
    const web = join(HERE, "../..");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== "node_modules") walk(path);
        } else if (/\.(ts|tsx)$/.test(entry.name) && isClientSide(path, readFileSync(path, "utf8"))) {
          const source = readFileSync(path, "utf8");
          if (/^import .*from ["']@\/lib\/verify["']/m.test(source)) offenders.push(path.slice(web.length + 1));
        }
      }
    };
    walk(join(web, "app"));
    walk(join(web, "components"));
    expect(offenders, "a client module that imports lib/verify statically puts a Node crypto polyfill on the page").toEqual([]);
    expect(CARD_SRC).toMatch(/await import\("@\/lib\/verify"\)/);
  });
});

/** Modules the browser runs, rather than the server: a client component, or the card the page renders. */
function isClientSide(path: string, source: string): boolean {
  if (/["']use client["']/.test(source)) return true;
  return /components[\\/]CertificateCard\.tsx$/.test(path);
}

describe("#86 the file control in the page a visitor sees", () => {
  it("gives the file input a label, so the keyboard reaches it", () => {
    const labels = elements(tree).filter((el) => el.props.htmlFor === "certificate-file");
    expect(labels).toHaveLength(1);
    expect(textOf(labels[0])).toMatch(/certificate file/);
    const input = fileInput();
    expect(input.props.type).toBe("file");
    expect(String(input.props.accept)).toContain(".json");
  });

  it("loads a certificate from a file and says it was not uploaded", async () => {
    const text = JSON.stringify(goodCert);
    await chooseFiles([certFile(text, "receipt-42.json")]);
    expect(textOf(note() ?? null)).toMatch(/Loaded receipt-42\.json/);
    expect(textOf(note() ?? null)).toMatch(/nothing was uploaded/);
    const box = elements(tree).find((el) => el.props.id === "certificate-json");
    expect(box?.props.value).toBe(text);
    expect(badge()).toMatch(/Consistent with this root/);
  });

  it("shows the parse error next to the input, named after the file", async () => {
    await chooseFiles([certFile(JSON.stringify(goodCert).slice(0, 40), "broken.json")]);
    const shown = note();
    expect(shown).toBeTruthy();
    expect(shown?.props.role).toBe("alert");
    expect(textOf(shown ?? null)).toContain("broken.json");
    expect(textOf(shown ?? null)).toMatch(/isn't valid JSON/);
    expect(elements(tree).some((el) => el.props["data-testid"] === "certificate-result")).toBe(false);
  });

  it("points the input at that error for a screen reader", async () => {
    await chooseFiles([certFile("{}", "empty-object.json")]);
    expect(fileInput().props["aria-describedby"]).toBe("certificate-file-note");
    expect(note()).toBeTruthy();
  });

  it("accepts a dropped file through the same path as a chosen one", async () => {
    await dropFiles([certFile(JSON.stringify(goodCert), "dropped.json")]);
    expect(textOf(note() ?? null)).toMatch(/Loaded dropped\.json/);
    expect(badge()).toMatch(/Consistent with this root/);
  });

  it("refuses a dropped pile of files without reading any of them", async () => {
    await dropFiles([certFile("{}"), certFile("{}")] as File[]);
    expect(reads).toBe(0);
    expect(textOf(note() ?? null)).toMatch(/One certificate at a time/);
  });

  it("flags a tampered certificate loaded from a file, once the proof has been checked", async () => {
    await chooseFiles([certFile(JSON.stringify(tamperedCert), "altered.json")]);
    expect(badge()).toMatch(/Leaf Mismatch/);
    const alert = elements(tree).find((el) => el.props["data-testid"] === "leaf-mismatch-alert");
    expect(alert, "the mismatch line is the whole point of recomputing the leaf").toBeTruthy();
    expect(textOf(alert ?? null)).toMatch(/has been altered/);
  });

  it("says which file could not be read when the disk refuses", async () => {
    vi.spyOn(File.prototype, "text").mockRejectedValue(new Error("EACCES: permission denied"));
    await chooseFiles([certFile("{}", "locked.json")]);
    const shown = textOf(note() ?? null);
    expect(shown).toMatch(/locked\.json could not be read from disk/);
    expect(shown).not.toMatch(/EACCES/);
    expect(elements(tree).some((el) => el.props["data-testid"] === "file-loaded")).toBe(false);
  });

  it("is honest while the proof is being checked", async () => {
    cells.length = 0;
    props = { initialCertificate: goodCert };
    render();
    expect(badge()).toMatch(/Checking the proof in this browser/);
  });

  it("keeps the paste box working, with its own error line", async () => {
    await clickInspect();
    expect(textOf(elements(tree).find((el) => el.props.role === "alert") ?? null)).toMatch(/no certificate here yet/);
    await typeIntoBox(JSON.stringify(goodCert));
    await clickInspect();
    expect(badge()).toMatch(/Consistent with this root/);
  });

  it("still asks the chain about an anchored certificate, and only about its fields", async () => {
    const bodies: string[] = [];
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockImplementation((input: unknown, init?: RequestInit) => {
      fetches.push(String(input));
      bodies.push(String(init?.body ?? ""));
      return Promise.resolve(new Response("{}", { status: 200 })) as never;
    });
    await mount({ initialCertificate: { ...goodCert, status: "anchored", batchId: 42 } });
    // The harness re-runs every captured effect on each render, so the number of calls is not the
    // finding — the endpoint reached and the fields sent are.
    expect([...new Set(fetches)]).toEqual(["/api/certificates/verify"]);
    expect(bodies.length).toBeGreaterThan(0);
    const allowed = ["batchId", "leaf", "proof", "receiptAnchorId"];
    for (const body of bodies) {
      const sent = JSON.parse(body) as Record<string, unknown>;
      for (const key of Object.keys(sent)) expect(allowed, key).toContain(key);
      expect(sent.batchId).toBe(42);
      expect(sent.leaf).toBe(LEAF);
      // The probe is about the anchor, not a copy of the record: the amounts and the outcome stay here.
      expect(body).not.toContain("transition");
      expect(body).not.toContain("toSeller");
    }
    // An answer that does not verify is reported as such; the badge never assumes the chain agreed.
    const chain = elements(tree).find((el) => el.props["data-testid"] === "onchain-badge");
    expect(textOf(chain ?? null)).toMatch(/Unverifiable on-chain/);
  });

  it("replaces the note about a good file when the next one is unusable", async () => {
    await chooseFiles([certFile(JSON.stringify(goodCert), "receipt-42.json")]);
    expect(textOf(note() ?? null)).toMatch(/Loaded receipt-42\.json/);
    await chooseFiles([new File(["{}"], "notes.txt")]);
    const shown = textOf(note() ?? null);
    expect(shown).toMatch(/notes\.txt isn't a \.json file/);
    expect(shown, "the stale 'Loaded' line must not survive a rejected file").not.toMatch(/Loaded/);
    expect(fileInput().props["aria-describedby"]).toBe("certificate-file-note");
    // And the other way round: a good file after a bad one clears the complaint.
    await chooseFiles([certFile(JSON.stringify(goodCert), "receipt-43.json")]);
    const after = textOf(note() ?? null);
    expect(after).toMatch(/Loaded receipt-43\.json/);
    expect(after, "an error line about a file nobody loaded must go when a later file works").not.toMatch(/isn't a/);
  });
});
