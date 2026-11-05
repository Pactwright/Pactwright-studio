/**
 * `GET /api/pacts` — the paged collection. #75.
 *
 * Studio had `GET /api/pacts/<id>` and nothing that could answer "what is on chain right now" without
 * N requests, which is what an agent or the dashboards need. The filters, the keyset cursor and the
 * capped limit are parsed in `collection.ts`; the query is in `lib/pacts`.
 */
import { listPacts } from "@/lib/pacts";
import { parsePactRequest } from "./collection";

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const parsed = parsePactRequest(params);
  if (!parsed.ok) {
    return Response.json({ error: parsed.reason }, { status: 400 });
  }

  try {
    const { items, nextCursor } = await listPacts(parsed.filters);
    return Response.json({ items, nextCursor });
  } catch (err) {
    console.error("Failed to list pacts:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
