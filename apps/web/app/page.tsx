import { listRecentPacts } from "@/lib/pacts";
import { StateBadge } from "@/components/StateBadge";
import { Simulator } from "@/components/Simulator";
import { HowItWorks } from "@/components/HowItWorks";
import { FaqSection } from "@/components/FaqSection";
import { ScrollReveal } from "@/components/ScrollReveal";
import { LottieMark } from "@/components/LottieMark";
import { SealedPact, TheSplit, StageRail, AgentHandoff } from "@/components/illustrations";
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

  const settled = recent?.filter((p) => p.state === "settled" || p.state === "paid" || p.state === "released").length ?? 0;
  const refunded = recent?.filter((p) => p.state === "refunded" || p.state === "denied").length ?? 0;
  const open = (recent?.length ?? 0) - settled - refunded;

  return (
    <main className="shell">
      <ScrollReveal />

      <article className="panel panel--feature">
        <div className="home-intro">
          <h1>Purchases, on the record.</h1>
          <div className="home-copy">
            <p className="lede">
              Pactwright Studio is the public ledger and the escrow engine for purchases made by AI agents on Stellar.
            </p>
            <p className="prose">
              When an agent buys an API call, compute, or a dataset translation, the money waits in a Soroban contract
              until a verifier has checked what came back. Then it goes to the seller, or it goes back to the buyer.
              Studio shows you which, and why.
            </p>

            <div className="hero-actions">
              <a href="#simulator" className="cta">
                Run a settlement
              </a>
              <a href="#how-it-works" className="cta cta--secondary">
                How a pact works
              </a>
            </div>
          </div>
          <div className="home-side">
            <LottieMark src="/lottie/seal-press.json" size={200} label="A wax seal being pressed onto a signed pact" className="lottie-mark lottie-mark--hero" playOnMount />
            {recent !== null && recent.length > 0 && (
              <p className="ledger-proof">
                <strong>
                  {recent.length} pacts on this page: {settled} paid out, {refunded} sent back, {open} still open.
                </strong>
                <span>
                  Counted from the rows below, which are read from the chain, not written down by the sellers.
                </span>
              </p>
            )}
          </div>
        </div>
      </article>

      <HowItWorks />

      <section aria-labelledby="lookup-title" className="doc-section scroll-reveal" id="lookup">
        <h2 id="lookup-title">Follow one pact</h2>
        <p className="prose">
          A pact ID is the 64 hex characters a buyer&apos;s agent gets when it opens one. Paste one here and Studio
          shows every stage it has been through, with the transaction behind each.
        </p>
        <div className="section-split">
          <div>
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
          </div>
          <div className="section-plate">
            <SealedPact />
          </div>
        </div>
      </section>

      <section aria-labelledby="sim-title" className="doc-section scroll-reveal" id="simulator">
        <h2 id="sim-title">Set the terms, then break them</h2>
        <p className="prose">
          Four scenarios, one contract. Choose what the seller delivers and watch the same split the contract makes:
          who is paid, who is refunded, and what the ledger ends up saying.
        </p>
        <div className="illo-frame illo-frame--split">
          <TheSplit />
        </div>
        <Simulator />
      </section>

      <section aria-labelledby="recent-title" className="doc-section scroll-reveal" id="recent">
        <h2 id="recent-title">Recent pacts</h2>
        <p className="prose">
          The eight newest rows.{" "}
          <a href="/pacts">Browse the whole ledger</a>, filtered by state or by seller.
        </p>
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
                      <td>
                        <code className="mono">
                          <a href={`/pact/${p.pact_id}`}>
                            {p.pact_id.slice(0, 8)}…{p.pact_id.slice(-6)}
                          </a>
                        </code>
                      </td>
                      <td className="secondary">{modeName(p.mode)}</td>
                      <td className="num">{formatUsdc(p.cap)}</td>
                      <td className="num">{formatUsdc(p.to_seller)}</td>
                      <td className="num secondary">{formatUsdc(p.to_buyer)}</td>
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

      <FaqSection />

      <section aria-labelledby="views-title" className="doc-section scroll-reveal" id="views">
        <h2 id="views-title">Three ways in</h2>
        <p className="prose">
          Studio is one record with three desks over it. Each reads the same rows the chain wrote; none of them can
          change them.
        </p>
        <div className="illo-frame illo-frame--handoff">
          <AgentHandoff />
        </div>
        <div className="views">
          <a className="view" href="/pacts">
            <div className="view-copy">
              <h3>The pact ledger</h3>
              <p>
                Every pact Studio has indexed, newest first, filtered by state or seller. This is what the escrow
                contract has actually done, not what anyone booked.
              </p>
              <span className="view-go">Open the ledger</span>
            </div>
            <img
              className="view-shot"
              src="/screens/ledger.webp"
              width={1200}
              height={760}
              alt="The pact ledger page, showing rows of pacts with their state, amount and seller."
              loading="lazy"
              decoding="async"
            />
          </a>
          <a className="view" href="/merchant">
            <div className="view-copy">
              <h3>A seller&apos;s desk</h3>
              <p>
                Revenue, refunds and disputes for one Stellar account, route by route, with the anchored batches that
                prove each receipt.
              </p>
              <span className="view-go">See a seller</span>
            </div>
            <img
              className="view-shot"
              src="/screens/merchant.webp"
              width={1200}
              height={760}
              alt="The merchant dashboard, showing a seller's revenue, refunds and per-route totals."
              loading="lazy"
              decoding="async"
            />
          </a>
          <a className="view" href="/verify">
            <div className="view-copy">
              <h3>Certificate check</h3>
              <p>
                Drop a receipt certificate in and it is checked against the Merkle root anchored on Stellar. The maths
                runs in your browser, so nothing of yours leaves it.
              </p>
              <span className="view-go">Verify a certificate</span>
            </div>
            <img
              className="view-shot"
              src="/screens/verify.webp"
              width={1200}
              height={900}
              alt="The certificate viewer with a verified receipt and its anchored Merkle proof."
              loading="lazy"
              decoding="async"
            />
          </a>
        </div>
      </section>
    </main>
  );
}
