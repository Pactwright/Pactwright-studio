"use client";

import { useEffect } from "react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // `error.message` and `error.stack` come from inside the server and can name a host, a table or a
    // connection string. The digest is the id the server log keys the full error under, so it is the
    // only part of this object that is safe to emit in a browser.
    console.error("Studio runtime error:", error.digest ?? "(no digest)");
  }, [error]);

  return (
    <main className="shell">
      <article className="panel" role="alert">
        <h1 className="id-heading">This page hit an error</h1>
        <p className="notice">
          Studio could not finish building this page, and what went wrong is not something the page itself
          can see. Nothing about your pact changed: the money stays where the on-chain record says it is.
          Retry, or pick up from one of the pages below.
        </p>
        {error.digest ? (
          <p className="prose">
            If you report this, quote reference <code>{error.digest}</code> — it is what the server log has
            the full error under.
          </p>
        ) : null}
        <p className="prose">
          <button type="button" className="cta" onClick={() => reset()}>
            Retry
          </button>
        </p>
        <nav aria-label="Other views">
          <p className="prose">
            <a href="/">Look up a pact by ID</a> · <a href="/pacts">Browse the ledger</a> ·{" "}
            <a href="/verify">Verify a certificate</a>
          </p>
        </nav>
      </article>
    </main>
  );
}
