export default function NotFound() {
  return (
    <main className="shell">
      <article className="panel">
        <h1 className="id-heading">404 — Not Found</h1>
        <p className="notice">
          No pact, record, or route matching this request has been indexed. Check the identifier or parameters.
        </p>
        <p className="prose">
          <a href="/">Return to home</a>
        </p>
      </article>
    </main>
  );
}
