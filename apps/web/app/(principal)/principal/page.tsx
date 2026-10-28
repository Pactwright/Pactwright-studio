import { getPrincipalDashboardData } from "@/lib/principal";
import { AccountLink } from "@/components/TxLink";
import { StateBadge } from "@/components/StateBadge";
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
    // Database connection or table empty
  }

  if (!data) {
    return (
      <main className="max-w-5xl mx-auto p-6 font-sans">
        <h1 className="text-2xl font-bold mb-4">Principal View</h1>
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded text-yellow-800 text-sm">
          No principal data found. Ensure migrations and seed data are loaded via <code>pnpm db:seed</code>.
        </div>
      </main>
    );
  }

  const { principal, allPrincipals, agents, budgets, livePacts, metrics } = data;

  return (
    <main className="max-w-5xl mx-auto p-6 font-sans">
      <header className="flex flex-col md:flex-row md:items-center justify-between border-b pb-4 mb-6 gap-4">
        <div>
          <span className="text-xs text-gray-500 uppercase tracking-wider block">Principal Account</span>
          <h1 className="text-xl font-mono font-bold text-gray-900 break-all">{principal}</h1>
        </div>

        {allPrincipals.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Switch:</span>
            <div className="flex gap-1">
              {allPrincipals.map((p) => (
                <a
                  key={p}
                  href={`/principal?principal=${p}`}
                  className={`text-xs px-2.5 py-1 rounded border font-mono ${
                    p === principal
                      ? "bg-blue-600 text-white border-blue-600 font-semibold"
                      : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {p.slice(0, 4)}…{p.slice(-4)}
                </a>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* Metrics */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <span className="text-xs text-gray-500 uppercase font-medium">Total Allocated</span>
          <p className="text-2xl font-mono font-bold text-gray-900 mt-1">
            {metrics.totalBudget} <span className="text-xs text-gray-500 font-sans">USDC</span>
          </p>
          <span className="text-xs text-gray-400 mt-1 block">Across all agent budgets</span>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <span className="text-xs text-gray-500 uppercase font-medium">Funded Balance</span>
          <p className="text-2xl font-mono font-bold text-green-700 mt-1">
            {metrics.fundedBudget} <span className="text-xs text-gray-500 font-sans">USDC</span>
          </p>
          <span className="text-xs text-gray-400 mt-1 block">Ready for autonomous spend</span>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <span className="text-xs text-gray-500 uppercase font-medium">Managed Agents</span>
          <p className="text-2xl font-mono font-bold text-blue-700 mt-1">{metrics.activeAgentsCount}</p>
          <span className="text-xs text-gray-400 mt-1 block">Autonomous signer accounts</span>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <span className="text-xs text-gray-500 uppercase font-medium">Live Pacts</span>
          <p className="text-2xl font-mono font-bold text-purple-700 mt-1">{metrics.livePactsCount}</p>
          <span className="text-xs text-gray-400 mt-1 block">Currently active on-chain</span>
        </div>
      </section>

      {/* Agents & Budgets */}
      <section className="bg-white rounded-lg border border-gray-200 shadow-sm p-5 mb-8">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Agent Budgets</h2>
        {budgets.length === 0 ? (
          <p className="text-xs text-gray-500 italic">No budgets registered for these agents.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="py-2.5 px-3 font-semibold text-gray-600">Agent Address</th>
                  <th className="py-2.5 px-3 font-semibold text-gray-600">Label</th>
                  <th className="py-2.5 px-3 font-semibold text-gray-600">Amount</th>
                  <th className="py-2.5 px-3 font-semibold text-gray-600">Asset</th>
                  <th className="py-2.5 px-3 font-semibold text-gray-600">Status</th>
                  <th className="py-2.5 px-3 font-semibold text-gray-600">Gate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-mono">
                {budgets.map((b) => {
                  const agent = agents.find((a) => a.address === b.agent);
                  return (
                    <tr key={b.id} className="hover:bg-gray-50">
                      <td className="py-2.5 px-3">
                        <AccountLink address={b.agent} />
                      </td>
                      <td className="py-2.5 px-3 font-sans text-gray-700">{agent?.label ?? "—"}</td>
                      <td className="py-2.5 px-3 font-bold text-gray-900">{b.amount}</td>
                      <td className="py-2.5 px-3 text-gray-600">{b.asset}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            b.status === "funded"
                              ? "bg-green-100 text-green-800"
                              : "bg-yellow-100 text-yellow-800"
                          }`}
                        >
                          {b.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 uppercase text-gray-500">{b.gate}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Live Pacts */}
      <section className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Live & Active Pacts</h2>
        {livePacts.length === 0 ? (
          <p className="text-xs text-gray-500 italic">No live pacts active at the moment.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="py-2.5 px-3 font-semibold text-gray-600">Pact ID</th>
                  <th className="py-2.5 px-3 font-semibold text-gray-600">Status</th>
                  <th className="py-2.5 px-3 font-semibold text-gray-600">Mode</th>
                  <th className="py-2.5 px-3 font-semibold text-gray-600">Cap (USDC)</th>
                  <th className="py-2.5 px-3 font-semibold text-gray-600">Seller</th>
                  <th className="py-2.5 px-3 font-semibold text-gray-600">Resource</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-mono">
                {livePacts.map((p) => (
                  <tr key={p.pact_id} className="hover:bg-gray-50">
                    <td className="py-2.5 px-3 text-blue-600 font-bold">
                      <a href={`/pact/${p.pact_id}`} className="hover:underline">
                        {p.pact_id.slice(0, 8)}…{p.pact_id.slice(-8)}
                      </a>
                    </td>
                    <td className="py-2.5 px-3">
                      <StateBadge state={p.state as PactState} />
                    </td>
                    <td className="py-2.5 px-3 uppercase text-gray-700">{p.mode}</td>
                    <td className="py-2.5 px-3 font-bold text-gray-900">{p.cap}</td>
                    <td className="py-2.5 px-3">
                      <AccountLink address={p.seller} />
                    </td>
                    <td className="py-2.5 px-3 font-sans text-gray-600 break-all">{p.resource_url}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
