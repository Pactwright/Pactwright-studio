/**
 * Liveness probe separating "process is up" from "sources are readable".
 * ROADMAP S-10, XC-03, #48.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json(
    { status: "ok", uptime: process.uptime() },
    { status: 200 }
  );
}
