/** Indexer cron (protected by CRON_SECRET). ROADMAP S-02. */
import { sync } from "@/lib/indexer";

export async function GET(request: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    const secretHeader = request.headers.get("x-cron-secret");
    const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (bearer !== cronSecret && secretHeader !== cronSecret) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await sync();
    return Response.json({ ok: true, result });
  } catch (err) {
    console.error("Sync failed:", err);
    return Response.json({ error: "Sync failed" }, { status: 500 });
  }
}
