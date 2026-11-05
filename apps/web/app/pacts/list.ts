/**
 * The data behind `/pacts`: what the query parameters mean, what the page may ask the database for, and
 * what the paging links look like. Kept out of `page.tsx` so the cursor and the filters can be tested
 * without rendering, and so a visitor and a program reading `/api/pacts` get the same rules from the same
 * parser — a `?state=` the API rejects must not be a page that silently shows everything. #74.
 */
import { DEFAULT_LIMIT, parsePactRequest } from "@/app/api/pacts/collection";
import { listPacts, type PactPageFilters } from "@/lib/pacts";
import type { PactRow } from "@/lib/types";

/** Next hands a page its query parameters as strings, or arrays when a name repeats. */
export type SearchParamValue = string | string[] | undefined;
export type SearchParams = Record<string, SearchParamValue>;

/** A repeated name is a browser or a stray link, not two filters: the first value wins. */
export function toSearchParams(params: SearchParams): URLSearchParams {
  const out = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined) out.set(name, first);
  }
  return out;
}

export type PactsView =
  | { kind: "page"; filters: PactPageFilters; items: PactRow[]; nextCursor: string | null }
  | { kind: "rejected"; reason: string }
  | { kind: "unavailable" };

/**
 * A bad request and an unreadable database are answered on the page rather than thrown, because both have
 * something to tell the visitor: what to change, or when to come back. `error.tsx` cannot say either.
 */
export async function readPactsView(params: SearchParams): Promise<PactsView> {
  const parsed = parsePactRequest(toSearchParams(params));
  if (!parsed.ok) return { kind: "rejected", reason: parsed.reason };

  try {
    const page = await listPacts(parsed.filters);
    return { kind: "page", filters: parsed.filters, items: page.items, nextCursor: page.nextCursor };
  } catch {
    return { kind: "unavailable" };
  }
}

/** The filters in force, in words. Nothing active is `null`, so callers can say "all pacts" instead. */
export function filtersLabel(filters: PactPageFilters): string | null {
  const parts: string[] = [];
  if (filters.state) parts.push(`state = ${filters.state}`);
  if (filters.seller) parts.push(`seller = ${filters.seller}`);
  if (parts.length === 0) return null;
  return parts.join(" and ");
}

/** A `/pacts` link with the filters kept and the paging position set to `cursor` (none means the front). */
export function pageHref(filters: PactPageFilters, cursor: string | null): string {
  const params = new URLSearchParams();
  if (filters.state) params.set("state", filters.state);
  if (filters.seller) params.set("seller", filters.seller);
  if (filters.limit !== DEFAULT_LIMIT) params.set("limit", String(filters.limit));
  if (cursor) params.set("cursor", cursor);
  const query = params.toString();
  return query ? `/pacts?${query}` : "/pacts";
}

/** What to do when the page has no rows: the filters are named, because "nothing yet" is wrong when they caused it. */
export function emptyAdvice(filters: PactPageFilters): string {
  const active = filtersLabel(filters);
  return active
    ? `No pacts match ${active}. A pact keeps the state it reached, so try a later one, or clear the filters to see everything.`
    : "Nothing is indexed yet. A pact appears here a few minutes after it opens on-chain; sync runs every few minutes.";
}

/** A UTC stamp: no locale and no relative "5 min ago", so the page and its tests say the same string. */
export function formatStamp(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())} ` +
    `${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())} UTC`
  );
}

/** The short form of a 64-character ID or address, with both ends kept so two rows can be told apart. */
export function shortId(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}
