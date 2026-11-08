"use client";

import { useState } from "react";

interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

const FAQS: FaqItem[] = [
  {
    id: "faq-what",
    question: "What is actually being held in escrow?",
    answer:
      "A cap, in USDC, locked by the buyer's agent when it opens the pact. It is the most that can ever move to the seller for that purchase. Two modes exist: an exact-refund pact, where a cooperative seller returns what was not delivered, and an escrow pact, where a verifier's verdict decides the split. There is no mode where the seller can draw more than the cap.",
  },
  {
    id: "faq-verifier-wrong",
    question: "What if the verifier gets it wrong?",
    answer:
      "The verdict is a signed attestation recorded against the pact, so a wrong one is attributable rather than anonymous. It is checked against the condition the pact was opened with, which is written down before the work starts. If the verdict never arrives at all, the pact's silence option decides the outcome — that case is settled in advance, not left open.",
  },
  {
    id: "faq-stellar",
    question: "Do I need a Stellar account to read any of this?",
    answer:
      "No. Studio is a public record: pacts, stages, verdicts and certificates are readable here without connecting a wallet. You need a Stellar account to open a pact, to sell into one, or to sign anything. The network this deployment reads is stated in the footer of every page.",
  },
  {
    id: "faq-fees",
    question: "Who pays the network fees?",
    answer:
      "Stellar fees are denominated in XLM and are a fraction of a cent per transaction, which is why an agent can open and settle pacts without the fee dwarfing the purchase. The sponsor balance that covers rent for the contract instances is monitored, and its floor is one of the operations probes.",
  },
  {
    id: "faq-proof",
    question: "What does a certificate actually prove?",
    answer:
      "That a specific receipt was included in a batch whose Merkle root was anchored on Stellar. The leaf is a hash over the pact, the ledger, the cap, the payout, the envelope and a nonce. The viewer recomputes the proof in your browser, so you can check a certificate without trusting this site's opinion about it.",
  },
  {
    id: "faq-integrate",
    question: "How does a service start selling into this?",
    answer:
      "A seller registers its Stellar address and the endpoint it will serve, and signs that registration so it cannot be attributed to anyone else. From then on it receives pacts for that route, signs delivery receipts for what it sends, and is paid by the contract's settlement rather than by an invoice.",
  },
  {
    id: "faq-privacy",
    question: "Is my purchase visible to other people?",
    answer:
      "The pact is: its amount, its parties, its states and its settlement are on a public chain, which is the point of the record. What is not published here is any payload. Evidence and deliverables stay between the parties and the verifier.",
  },
  {
    id: "faq-live",
    question: "Is this production?",
    answer:
      "The record you are reading is real for the network named in the footer. This deployment reads Stellar testnet, so the amounts are genuine contract behaviour and not real money. The same code path runs against pubnet.",
  },
];

export function FaqSection() {
  const [openId, setOpenId] = useState<string | null>("faq-what");

  const toggle = (id: string) => setOpenId((prev) => (prev === id ? null : id));

  return (
    <section aria-labelledby="faq-title" className="panel scroll-reveal" id="faq">
      <header className="section-head">
        <h2 id="faq-title" className="section-title">
          Questions people ask before they hand an agent a budget
        </h2>
        <p className="lede-sub">
          Eight of them, answered with what the contract does rather than what the product promises.
        </p>
      </header>

      <div className="faq-accordion">
        {FAQS.map((faq) => {
          const isOpen = openId === faq.id;
          return (
            <div key={faq.id} className={`faq-card ${isOpen ? "faq-card--open" : ""}`}>
              <h3 className="faq-heading">
                <button
                  type="button"
                  className="faq-question-btn"
                  aria-expanded={isOpen}
                  aria-controls={`content-${faq.id}`}
                  id={`btn-${faq.id}`}
                  onClick={() => toggle(faq.id)}
                >
                  <span className="faq-q-text">{faq.question}</span>
                  <span className="faq-mark" aria-hidden="true" />
                </button>
              </h3>

              <div
                id={`content-${faq.id}`}
                className="faq-answer-collapse"
                role="region"
                aria-labelledby={`btn-${faq.id}`}
              >
                <p className="faq-answer-text">{faq.answer}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
