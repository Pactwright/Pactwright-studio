import { getMerchantDashboardData } from "@/lib/merchant";
import { AccountLink } from "@/components/TxLink";
import { formatUsdc, modeName, silenceName } from "@/lib/format";

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
    // Database unavailable or empty
  }

  if (!data) {
    return (
      <main className="desk">
        <article className="document">
          <h1>Merchant Dashboard</h1>
          <p className="notice">
            No sellers are registered yet. Running Studio locally? Load the sample sellers with <code>pnpm db:seed</code>.
          </p>
        </article>
      </main>
    );
  }

  const { seller, allSellers, metrics, routes } = data;

  return (
    <main className="desk">
      <article className="document document--watermark">
        <span className="field-label">Merchant Dashboard</span>
        <h1>{seller.name}</h1>
        <p className="prose">
          Seller account <AccountLink address={seller.address} truncate={false} />
        </p>

        {allSellers.length > 1 && (
          <nav className="chooser" aria-label="Choose a seller">
            <span className="field-label">Other sellers</span>
            {allSellers.map((s) => (
              <a key={s.address} href={`/merchant?seller=${s.address}`} aria-current={s.address === seller.address ? "true" : undefined}>
                {s.name}
              </a>
            ))}
          </nav>
        )}

        <section className="totals" aria-label="Totals">
          <div className="total-box">
            <span className="field-label">Revenue</span>
            <span className="typed-value">{formatUsdc(metrics.totalRevenue)} USDC</span>
            <small>From settled and paid pacts</small>
          </div>
          <div className="total-box">
            <span className="field-label">Pacts</span>
            <span className="typed-value">{metrics.totalPacts}</span>
            <small>{metrics.settledPacts} settled</small>
          </div>
          <div className="total-box">
            <span className="field-label">Refund rate</span>
            <span className="typed-value">{metrics.refundRate}%</span>
            <small>{metrics.refundedPacts} refunded</small>
          </div>
          <div className="total-box">
            <span className="field-label">Dispute rate</span>
            <span className="typed-value">{metrics.disputeRate}%</span>
            <small>{metrics.disputeCount} denied verdicts</small>
          </div>
        </section>

        <section className="doc-section" aria-labelledby="routes-title">
          <h2 id="routes-title">Routes and prices</h2>
          {routes.length === 0 ? (
            <p className="empty-note">This seller hasn&apos;t registered any routes.</p>
          ) : (
            <div className="ledger-wrap">
              <table className="ledger">
                <thead>
                  <tr>
                    <th scope="col">Resource</th>
                    <th scope="col">Mode</th>
                    <th scope="col" className="num">Price (USDC)</th>
                    <th scope="col">If no verdict arrives</th>
                    <th scope="col" className="num">Refund window</th>
                  </tr>
                </thead>
                <tbody>
                  {routes.map((route) => (
                    <tr key={route.id}>
                      <td className="typed wrap">{route.resource_url}</td>
                      <td>{modeName(route.mode)}</td>
                      <td className="typed num">{formatUsdc(route.price)}</td>
                      <td>{silenceName(route.silence)}</td>
                      <td className="typed num">{route.refund_window_ledgers} ledgers</td>
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
