/** Temporary copy of the base pact page, for checking the regression test fails on base. */
import { getPactById } from "@/lib/pacts";

export default async function PactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let data = null;
  try {
    data = await getPactById(id);
  } catch {
    // Falls through to the not-found view
  }

  if (!data) {
    return (
      <main className="shell">
        <article className="panel">
          <h1 className="id-heading">{id}</h1>
          <p className="notice">
            No pact with this ID has been indexed. Check the ID; a pact opened in the last few minutes may not be indexed yet.
          </p>
        </article>
      </main>
    );
  }

  return <main className="shell">{data.pact.pact_id}</main>;
}
