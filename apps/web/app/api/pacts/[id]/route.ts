/** Pact + events timeline. ROADMAP S-05. */
import { getPactById } from "@/lib/pacts";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  if (!id) {
    return Response.json({ error: "Missing pact ID" }, { status: 400 });
  }

  try {
    const data = await getPactById(id);
    if (!data) {
      return Response.json({ error: "Pact not found" }, { status: 404 });
    }

    return Response.json(data);
  } catch (err) {
    console.error("Failed to fetch pact:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
