/**
 * `/pacts` — the indexed ledger, newest first, browsable without knowing a 64-character ID. #74.
 *
 * Paging is a keyset cursor carried in the link, not a page number: the indexer is still appending pacts
 * above the page a visitor is reading, so an `OFFSET` page repeats or drops one whenever a row lands. The
 * only way back from deep in the ledger is "newest", which is honest about what a forward-only cursor can
 * offer. Filters and paging travel as query parameters, so every state of this page is a link that can be
 * pasted, and none of it needs JavaScript.
 */
import { PACT_STATES } from "@/app/api/pacts/collection";
import { emptyAdvice, filtersLabel, formatStamp, pageHref, readPactsView, shortId, type SearchParams } from "@/app/pacts/list";
import { StateBadge } from "@/components/StateBadge";
import { accountUrl, getNetwork } from "@/lib/explorer";
import { formatUsdc } from "@/lib/format";

// The ledger is read on each request, not frozen at build time.
export const dynamic = "force-dynamic";

export const metadata = { title: "Pact ledger — Pactwright Studio" };

export default async function PactsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const view = await readPactsView(await searchParams);
  const network = getNetwork();

  return (
    <main className="shell">
      <article className="panel panel--feature">
        <h1>Pact ledger</h1>
        <p className="prose">
          Every pact Studio has indexed, newest first. Open one to see where the money went, step by step.
        </p>

        <section aria-labelledby="filters-title" className="doc-section">
          <h2 id="filters-title" className="visually-hidden">
            Filters
          </h2>
          <form className="lookup" action="/pacts" method="get">
            <div>
              <label className="field-label" htmlFor="state">
                State
              </label>
              <select id="state" name="state" className="field" defaultValue={view.kind === "page" ? (view.filters.state ?? "") : ""}>
                <option value="">Any state</option>
                {PACT_STATES.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="seller">
                Seller address
              </label>
              <input
                id="seller"
                name="seller"
                className="field"
                placeholder="G…"
                autoComplete="off"
                spellCheck={false}
                defaultValue={view.kind === "page" ? (view.filters.seller ?? "") : ""}
              />
            </div>
            <div className="actions">
              <button type="submit" className="cta">
                Filter
              </button>
            </div>
          </form>
          {view.kind === "page" && filtersLabel(view.filters) ? (
            <p className="prose">
              Filtered to {filtersLabel(view.filters)}. <a href={pageHref({ ...view.filters, state: undefined, seller: undefined }, null)}>Clear filters</a>
            </p>
          ) : null}
        </section>

        {view.kind === "rejected" ? (
          <p className="empty-note" role="alert">
            {view.reason}. <a href="/pacts">Start from the newest pacts</a>
          </p>
        ) : view.kind === "unavailable" ? (
          <p className="empty-note" role="alert">
            The pact ledger can&apos;t be read right now — the database did not answer. Try again in a minute; the
            list is not empty, it is unreachable.
          </p>
        ) : view.items.length === 0 ? (
          <p className="empty-note">{emptyAdvice(view.filters)}</p>
        ) : (
          <>
            <div className="ledger-wrap">
              <table className="ledger">
                <caption className="visually-hidden">
                  Pacts, newest first, {view.filters.limit} to a page.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Pact</th>
                    <th scope="col">State</th>
                    <th scope="col" className="num">
                      Amount
                    </th>
                    <th scope="col" className="secondary">
                      Seller
                    </th>
                    <th scope="col" className="secondary">
                      Last change
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {view.items.map((pact) => (
                    <tr key={pact.pact_id}>
                      <td className="mono">
                        <a href={`/pact/${pact.pact_id}`}>{shortId(pact.pact_id)}</a>
                      </td>
                      <td>
                        <StateBadge state={pact.state} />
                      </td>
                      <td className="mono num">{formatUsdc(pact.cap)}</td>
                      <td className="mono secondary">
                        <a href={accountUrl(network, pact.seller)} rel="noreferrer noopener" target="_blank">
                          {shortId(pact.seller)}
                        </a>
                      </td>
                      <td className="mono secondary">{formatStamp(pact.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <nav className="actions" aria-label="Paging">
              {view.nextCursor ? (
                <a href={pageHref(view.filters, view.nextCursor)}>Older pacts</a>
              ) : (
                <span className="prose">These are the oldest indexed pacts.</span>
              )}{" "}
              {view.filters.after ? <a href={pageHref(view.filters, null)}>Back to the newest pacts</a> : null}
            </nav>
          </>
        )}
      </article>
    </main>
  );
}
