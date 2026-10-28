import { getMerchantDashboardData } from "@/lib/merchant";
import { AccountLink } from "@/components/TxLink";

export default async function MerchantDashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ seller?: string }>;
}) {
  const params = await searchParams;
  let data = null;
  try {
    data = await getMerchantDashboardData(params?.seller);
  } catch {
    // Database connection or table empty
  }

  if (!data) {
    return (
      <main className="max-w-5xl mx-auto p-6 font-sans">
        <h1 className="text-2xl font-bold mb-4">Merchant Dashboard</h1>
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded text-yellow-800 text-sm">
          No seller data found. Ensure migrations and seed data are loaded via <code>pnpm db:seed</code>.
        </div>
      </main>
    );
  }

  const { seller, allSellers, metrics, routes } = data;

  return (
    <main className="max-w-5xl mx-auto p-6 font-sans">
      <header className="flex flex-col md:flex-row md:items-center justify-between border-b pb-4 mb-6 gap-4">
        <div>
          <span className="text-xs text-gray-500 uppercase tracking-wider block">Seller Profile</span>
          <h1 className="text-2xl font-bold text-gray-900">{seller.name}</h1>
          <div className="text-xs mt-1">
            <span className="text-gray-500 mr-1">Address:</span>
            <AccountLink address={seller.address} truncate={false} />
          </div>
        </div>

        {allSellers.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Switch Seller:</span>
            <div className="flex gap-1">
              {allSellers.map((s) => (
                <a
                  key={s.address}
                  href={`/merchant?seller=${s.address}`}
                  className={`text-xs px-2.5 py-1 rounded border ${
                    s.address === seller.address
                      ? "bg-blue-600 text-white border-blue-600 font-semibold"
                      : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {s.name}
                </a>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* Metric Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <span className="text-xs text-gray-500 uppercase font-medium">Total Revenue</span>
          <p className="text-2xl font-mono font-bold text-green-700 mt-1">
            {metrics.totalRevenue} <span className="text-xs text-gray-500 font-sans">USDC</span>
          </p>
          <span className="text-xs text-gray-400 mt-1 block">From settled & paid pacts</span>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <span className="text-xs text-gray-500 uppercase font-medium">Total Pacts</span>
          <p className="text-2xl font-mono font-bold text-gray-900 mt-1">{metrics.totalPacts}</p>
          <span className="text-xs text-gray-400 mt-1 block">{metrics.settledPacts} settled successfully</span>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <span className="text-xs text-gray-500 uppercase font-medium">Refund Rate</span>
          <p className="text-2xl font-mono font-bold text-blue-700 mt-1">{metrics.refundRate}%</p>
          <span className="text-xs text-gray-400 mt-1 block">{metrics.refundedPacts} refunded pacts</span>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <span className="text-xs text-gray-500 uppercase font-medium">Dispute Rate</span>
          <p className="text-2xl font-mono font-bold text-purple-700 mt-1">{metrics.disputeRate}%</p>
          <span className="text-xs text-gray-400 mt-1 block">{metrics.disputeCount} denied verdicts</span>
        </div>
      </section>

      {/* Routes & Cost breakdown */}
      <section className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Configured Routes & Pricing</h2>

        {routes.length === 0 ? (
          <p className="text-xs text-gray-500 italic">No routes registered for this seller.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="py-2.5 px-3 font-semibold text-gray-600">Resource URL</th>
                  <th className="py-2.5 px-3 font-semibold text-gray-600">Mode</th>
                  <th className="py-2.5 px-3 font-semibold text-gray-600">Price (USDC)</th>
                  <th className="py-2.5 px-3 font-semibold text-gray-600">Silence Policy</th>
                  <th className="py-2.5 px-3 font-semibold text-gray-600">Refund Window</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-mono">
                {routes.map((route) => (
                  <tr key={route.id} className="hover:bg-gray-50">
                    <td className="py-2.5 px-3 text-blue-600 font-sans font-medium break-all">
                      {route.resource_url}
                    </td>
                    <td className="py-2.5 px-3 uppercase text-gray-700">{route.mode}</td>
                    <td className="py-2.5 px-3 text-gray-900 font-bold">{route.price}</td>
                    <td className="py-2.5 px-3 text-gray-600 capitalize font-sans">{route.silence ?? "none"}</td>
                    <td className="py-2.5 px-3 text-gray-500">{route.refund_window_ledgers} ledgers</td>
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
