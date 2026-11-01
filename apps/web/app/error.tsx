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
    console.error("Studio runtime error:", error);
  }, [error]);

  return (
    <main className="shell">
      <article className="panel error-panel" role="alert">
        <h1 className="id-heading">Service Unavailable</h1>
        <p className="notice">
          Unable to connect to the database or upstream indexer. Please verify the service health or try again later.
        </p>
        <p className="prose">
          <button type="button" className="btn" onClick={() => reset()}>
            Retry
          </button>
          {" · "}
          <a href="/">Return to home</a>
        </p>
      </article>
    </main>
  );
}
