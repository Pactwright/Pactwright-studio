/**
 * The `CRON_SECRET` guard the operator routes share.
 *
 * Fail closed on both counts: a route that cannot check a secret must not run at all, because these
 * endpoints trigger indexing and, through the anchorer, signed transactions that cost real money.
 */
export function cronAuthFailure(request: Request): Response | null {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return Response.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  const authHeader = request.headers.get("authorization");
  const secretHeader = request.headers.get("x-cron-secret");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (bearer !== cronSecret && secretHeader !== cronSecret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
