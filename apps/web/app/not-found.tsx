export default function NotFound() {
  return (
    <main className="shell">
      <article className="panel">
        <h1 className="id-heading">404 — Nothing at this address</h1>
        <p className="notice">
          Either Studio serves no page here, or the pact this address points at is not in the ledger this
          Studio reads. A pact ID is 64 hexadecimal characters; a truncated or pasted-with-spaces ID lands
          here. Nothing has been lost — look the pact up again, or browse what is indexed.
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
