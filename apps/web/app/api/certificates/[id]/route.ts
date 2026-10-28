/** Certificate (pending | anchored). ROADMAP S-05. */
import { getCertificateById } from "@/lib/certificates";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  if (!id) {
    return Response.json({ error: "Missing certificate or pact ID" }, { status: 400 });
  }

  try {
    const cert = await getCertificateById(id);
    if (!cert) {
      return Response.json({ error: "Certificate not found" }, { status: 404 });
    }

    return Response.json(cert);
  } catch (err) {
    console.error("Failed to fetch certificate:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
