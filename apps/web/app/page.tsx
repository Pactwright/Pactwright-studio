import { listRecentPacts } from "@/lib/pacts";
import { StateBadge } from "@/components/StateBadge";
import { Seal } from "@/components/Seal";
import { formatUsdc, modeName } from "@/lib/format";
import type { PactRow } from "@/lib/types";

// The ledger below is read on each request, not frozen at build time.
export const dynamic = "force-dynamic";

export default async function Home() {
  let recent: PactRow[] | null = null;
  try {
    recent = await listRecentPacts(8);
  } catch {
    // Database unavailable: the ledger says so below.
  }

  return (
    <main className="shell">
      <article className="panel panel--feature">
        <div className="home-intro">
          <div>
            <h1>Pactwright Studio</h1>
            <p className="lede">
              The public record of purchases made by AI agents on Stellar. Each purchase is a pact: the money waits in escrow
              until a verifier checks the delivery, then goes to the seller or back to the buyer.
            </p>
          </div>
          <Seal size={132} />
        </div>

        <section aria-labelledby="lookup-title" className="doc-section">
          <h2 id="lookup-title">Pact Timeline</h2>
          <p className="prose">Look up a pact by its ID to see where the money went, step by step.</p>
          <form className="lookup" action="/pact" method="get">
            <label htmlFor="pact-id" className="visually-hidden">
              Pact ID
            </label>
            <input
              id="pact-id"
              name="id"
              className="field"
              placeholder="64-character pact ID"
              autoComplete="off"
              spellCheck={false}
              required
              pattern="\s*[0-9a-fA-F]{64}\s*"
              title="A pact ID is 64 hexadecimal characters."
            />
            <button type="submit" className="cta">
              Open pact
            </button>
          </form>
        </section>

        <section aria-labelledby="recent-title" className="doc-section">
          <h2 id="recent-title">Recent pacts</h2>
          {recent === null ? (
            <p className="empty-note">The pact ledger can&apos;t be read right now. Try again in a minute.</p>
          ) : recent.length === 0 ? (
            <p className="empty-note">No pacts yet. A pact appears here a few minutes after it opens on-chain.</p>
          ) : (
            <div className="ledger-wrap">
              <table className="ledger">
                <thead>
                  <tr>
                    <th scope="col">Pact</th>
                    <th scope="col" className="secondary">Mode</th>
                    <th scope="col" className="num">Cap</th>
                    <th scope="col" className="num">To seller</th>
                    <th scope="col" className="num secondary">To buyer</th>
                    <th scope="col">State</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((p) => (
                    <tr key={p.pact_id}>
                      <td className="mono">
                        <a href={`/pact/${p.pact_id}`}>
                          {p.pact_id.slice(0, 8)}…{p.pact_id.slice(-6)}
                        </a>
                      </td>
                      <td className="secondary">{modeName(p.mode)}</td>
                      <td className="mono num">{formatUsdc(p.cap)}</td>
                      <td className="mono num">{formatUsdc(p.to_seller)}</td>
                      <td className="mono num secondary">{formatUsdc(p.to_buyer)}</td>
                      <td>
                        <StateBadge state={p.state} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </article>

      <nav className="tiles" aria-label="Other views">
        <a className="tile" href="/verify">
          <h2>Certificate Viewer</h2>
          <p>Check a receipt certificate against its anchored Merkle root. The check runs in your browser.</p>
          <span className="tile-go">Verify a certificate</span>
        </a>
        <a className="tile" href="/merchant">
          <h2>Merchant Dashboard</h2>
          <p>Revenue, refunds and disputes for a seller, route by route.</p>
          <span className="tile-go">See sellers</span>
        </a>
        <a className="tile" href="/principal">
          <h2>Principal View</h2>
          <p>Budgets and live pacts for the agents you fund.</p>
          <span className="tile-go">See agent budgets</span>
        </a>
      </nav>
    </main>
  );
}
