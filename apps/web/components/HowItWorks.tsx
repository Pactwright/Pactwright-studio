import { TwoDeadlines, StageRail } from "@/components/illustrations";

export function HowItWorks() {
  return (
    <section aria-labelledby="how-it-works-title" className="panel scroll-reveal" id="how-it-works">
      <header className="section-head section-head--split">
        <div>
          <h2 id="how-it-works-title" className="section-title">
            The life of one pact
          </h2>
          <p className="lede-sub">
            A pact is a promise with a deadline on each side of it: one for the verdict, one for the settlement. Nothing
            else in the system can move the money, and neither deadline can be moved once the pact is open.
          </p>
        </div>
        <div className="section-plate">
          <TwoDeadlines />
        </div>
      </header>

      <div className="rail-divider">
        <StageRail />
      </div>

      <ol className="pact-path">
        <li className="path-stop">
          <div className="path-head">
            <h3>The agent opens a pact</h3>
            <code className="path-stage">opened</code>
          </div>
          <p>
            Before it asks for anything, a buyer&apos;s agent opens a pact on Stellar and locks a cap into a Soroban
            contract. The cap is the most that can ever leave it, and it leaves the agent&apos;s own account, not a
            database balance.
          </p>
        </li>
        <li className="path-stop">
          <div className="path-head">
            <h3>The seller delivers and signs</h3>
            <code className="path-stage">paid</code>
          </div>
          <p>
            The seller runs the job and signs a delivery receipt for what it sent. There is exactly one attestation per
            pact: the buyer submits the evidence, the sellers sign the receipts, and neither can file a second one.
          </p>
        </li>
        <li className="path-stop">
          <div className="path-head">
            <h3>A verifier checks it</h3>
            <code className="path-stage">verdict</code>
          </div>
          <p>
            An independent verifier weighs the delivery against the condition the pact was opened with, and returns a
            verdict before the verdict deadline: allow, deny, or a partial that names how much was actually delivered.
          </p>
        </li>
        <li className="path-stop">
          <div className="path-head">
            <h3>The contract splits it</h3>
            <code className="path-stage">settled</code>
          </div>
          <p>
            The verdict goes on-chain and the contract pays the seller and returns the rest, in one transaction, before
            the settle deadline. The receipt leaf it produces is batched into a Merkle root and anchored to Stellar.
          </p>
        </li>
        <li className="path-stop path-stop--silence">
          <div className="path-head">
            <h3>Or nobody says anything</h3>
            <code className="path-stage">refunded</code>
          </div>
          <p>
            Silence is a case the pact already answers for. Each one is opened with what happens if the verdict never
            arrives: the cap goes back to the buyer, or the seller is paid. Either way the money does not sit in limbo,
            and no one has to open a dispute to find out which.
          </p>
        </li>
      </ol>

      <figure className="specimen scroll-reveal">
        <img
          className="specimen-shot"
          src="/screens/pact-record.webp"
          width={1200}
          height={900}
          alt="A pact record page: its seal, its state, the chain of stages it passed through and the transaction behind each."
          loading="lazy"
          decoding="async"
        />
        <figcaption>
          What one pact looks like once it has settled: every stage, the ledger it was written in, and the transaction
          behind each step.
        </figcaption>
      </figure>

      <div className="comparison">
        <h3 className="comparison-title">Why an agent can&apos;t just use a card</h3>
        <div className="comparison-grid">
          <div className="comparison-col">
            <h4>Buying on an API key</h4>
            <ul className="comp-list">
              <li>You pay before anyone has seen the output, and the only way back is a support ticket.</li>
              <li>A chargeback needs a human to notice, and to still have the evidence six weeks later.</li>
              <li>The provider&apos;s own counter is the record of what it charged you.</li>
              <li>If the service stops mid-request, the money for that request is gone.</li>
            </ul>
          </div>
          <div className="comparison-col comparison-col--pact">
            <h4>Buying on a pact</h4>
            <ul className="comp-list">
              <li>The cap sits in a contract until a verdict says what was delivered.</li>
              <li>The settlement is the contract&apos;s own transaction, so nobody has to be asked.</li>
              <li>The record is a public chain, and the receipt has a Merkle proof you can check alone.</li>
              <li>A missed deadline is an outcome the pact already decided in advance.</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
