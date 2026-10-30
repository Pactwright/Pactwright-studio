import { getPrincipalDashboardData } from "@/lib/principal";
import { AccountLink } from "@/components/TxLink";
import { StateBadge } from "@/components/StateBadge";
import { formatUsdc, modeName } from "@/lib/format";
import type { PactState } from "@/lib/types";

export default async function PrincipalViewPage({
  searchParams,
}: {
  searchParams?: Promise<{ principal?: string }>;
}) {
  const params = await searchParams;
  let data = null;
  try {
    data = await getPrincipalDashboardData(params?.principal);
  } catch {
    // Database unavailable or empty
  }

  if (!data) {
    return (
      <main className="shell">
        <article className="panel">
          <h1>Principal View</h1>
          <p className="notice">
            No principals are registered yet. Running Studio locally? Load the sample accounts with <code>pnpm db:seed</code>.
          </p>
        </article>
      </main>
    );
  }

  const { principal, allPrincipals, agents, budgets, livePacts, metrics } = data;

  return (
    <main className="shell">
      <article className="panel panel--feature">
        <span className="field-label">Principal View</span>
        <h1 className="id-heading">{principal}</h1>
        <p className="prose">The account that funds these agents, with each agent&apos;s budget and the pacts open right now.</p>

        {allPrincipals.length > 1 && (
          <nav className="chooser" aria-label="Choose a principal">
            <span className="field-label">Other principals</span>
            {allPrincipals.map((p) => (
              <a key={p} href={`/principal?principal=${p}`} className="mono" aria-current={p === principal ? "true" : undefined}>
                {p.slice(0, 4)}…{p.slice(-4)}
              </a>
            ))}
          </nav>
        )}

        <section className="totals" aria-label="Totals">
          <div className="stat">
            <span className="field-label">Allocated</span>
            <span className="value">{formatUsdc(metrics.totalBudget)} USDC</span>
            <small>Across all agent budgets</small>
          </div>
          <div className="stat">
            <span className="field-label">Funded</span>
            <span className="value">{formatUsdc(metrics.fundedBudget)} USDC</span>
            <small>Ready for agents to spend</small>
          </div>
          <div className="stat">
            <span className="field-label">Agents</span>
            <span className="value">{metrics.activeAgentsCount}</span>
            <small>Signing accounts</small>
          </div>
          <div className="stat">
            <span className="field-label">Open pacts</span>
            <span className="value">{metrics.livePactsCount}</span>
            <small>Not yet finished on-chain</small>
          </div>
        </section>

        <section className="doc-section" aria-labelledby="budgets-title">
          <h2 id="budgets-title">Agent budgets</h2>
          {budgets.length === 0 ? (
            <p className="empty-note">None of these agents has a budget yet.</p>
          ) : (
            <div className="ledger-wrap">
              <table className="ledger">
                <thead>
                  <tr>
                    <th scope="col">Agent</th>
                    <th scope="col">Name</th>
                    <th scope="col" className="num">Amount</th>
                    <th scope="col">Asset</th>
                    <th scope="col">Status</th>
                    <th scope="col">Approval</th>
                  </tr>
                </thead>
                <tbody>
                  {budgets.map((b) => {
                    const agent = agents.find((a) => a.address === b.agent);
                    return (
                      <tr key={b.id}>
                        <td className="mono">
                          <AccountLink address={b.agent} />
                        </td>
                        <td>{agent?.label ?? "Unnamed"}</td>
                        <td className="mono num">{formatUsdc(b.amount)}</td>
                        <td className="mono">{b.asset}</td>
                        <td>
                          <span className="stamp stamp--small" data-ink={b.status === "funded" ? "teal" : "indigo"}>
                            {b.status === "funded" ? "Funded" : "Not funded"}
                          </span>
                        </td>
                        <td>{b.gate}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="doc-section" aria-labelledby="open-title">
          <h2 id="open-title">Open pacts</h2>
          {livePacts.length === 0 ? (
            <p className="empty-note">No pacts are open right now.</p>
          ) : (
            <div className="ledger-wrap">
              <table className="ledger">
                <thead>
                  <tr>
                    <th scope="col">Pact</th>
                    <th scope="col">State</th>
                    <th scope="col">Mode</th>
                    <th scope="col" className="num">Cap (USDC)</th>
                    <th scope="col">Seller</th>
                  </tr>
                </thead>
                <tbody>
                  {livePacts.map((p) => (
                    <tr key={p.pact_id}>
                      <td className="mono">
                        <a href={`/pact/${p.pact_id}`}>
                          {p.pact_id.slice(0, 8)}…{p.pact_id.slice(-6)}
                        </a>
                      </td>
                      <td>
                        <StateBadge state={p.state as PactState} />
                      </td>
                      <td>{modeName(p.mode)}</td>
                      <td className="mono num">{formatUsdc(p.cap)}</td>
                      <td className="mono">
                        <AccountLink address={p.seller} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </article>
    </main>
  );
}
