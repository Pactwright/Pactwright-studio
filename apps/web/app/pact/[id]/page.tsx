/** Public pact timeline. ROADMAP S-06. */
import { Timeline } from "@/components/Timeline";

export default async function PactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main>
      <h1>Pact {id}</h1>
      <Timeline pactId={id} />
    </main>
  );
}
