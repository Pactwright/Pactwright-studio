/** Target of the home page's lookup form: /pact?id=<id> → /pact/<id>. Works without JavaScript. */
import { redirect } from "next/navigation";

export default async function PactLookup({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const clean = (id ?? "").trim().toLowerCase();
  redirect(clean ? `/pact/${encodeURIComponent(clean)}` : "/");
}
