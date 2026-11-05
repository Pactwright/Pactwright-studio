/**
 * Live conformance: the real handlers, a real Postgres, and the published document — nothing stubbed.
 *
 * `test/unit/openapi.test.ts` proves the document matches the handlers with the data sources stood in for,
 * which is how it found that `pact_events.id` is a `bigserial` that `pg` returns as a decimal string (a
 * `type: integer` declaration would have passed every mocked test and described a field no caller ever
 * sees). This is the same assertion against the database itself, so the shapes are measured, not believed.
 * `pnpm test` never runs it. Read-only: it sends no transaction and indexes nothing.
 *
 *   DATABASE_URL=postgres://… pnpm --filter web live:testnet
 */
import { describe, expect, it } from "vitest";
import { GET as certificateRoute } from "@/app/api/certificates/[id]/route";
import { POST as verifyRoute } from "@/app/api/certificates/verify/route";
import { GET as pactRoute } from "@/app/api/pacts/[id]/route";
import { GET as listPactsRoute } from "@/app/api/pacts/route";
import { openApiSpec, responseSchema } from "@/app/api/_spec/openapi";
import { db } from "@/lib/db";
import { validateAgainst } from "../unit/openapi-validate";

const enabled = Boolean(process.env.DATABASE_URL);

async function answer(method: string, path: string, status: number, res: Response): Promise<any> {
  const schema = responseSchema(method, path, status);
  expect(schema, `${method} ${path} documents no ${status}`).toBeDefined();
  const body: any = await res.json();
  expect(res.status, `${method} ${path} ${status}: ${JSON.stringify(body).slice(0, 300)}`).toBe(status);

  const problems = validateAgainst(openApiSpec, schema, body);
  expect(problems, `${method} ${path} ${status} from a real database: ${JSON.stringify(problems)}`).toEqual([]);
  return body;
}

describe.runIf(enabled)("the document describes what the database actually returns", () => {
  const request = (path: string) => new Request(`http://localhost${path}`) as never;
  const params = (id: string) => ({ params: Promise.resolve({ id }) }) as never;

  it("GET /api/pacts answers a first page", async () => {
    const body = await answer("GET", "/api/pacts", 200, await listPactsRoute(request("/api/pacts?limit=3")));

    expect(body.items.length).toBeGreaterThan(0);
    expect(new Date(body.items[0].created_at).toISOString()).toBe(body.items[0].created_at);
  });

  it("GET /api/pacts answers the page after the cursor it just published", async () => {
    const first = await answer("GET", "/api/pacts", 200, await listPactsRoute(request("/api/pacts?limit=2")));
    expect(first.nextCursor).toEqual(expect.any(String));

    const second = await listPactsRoute(request(`/api/pacts?limit=2&cursor=${encodeURIComponent(first.nextCursor)}`));
    const body = await answer("GET", "/api/pacts", 200, second);

    expect(body.items.map((row: { pact_id: string }) => row.pact_id)).not.toEqual(
      first.items.map((row: { pact_id: string }) => row.pact_id)
    );
  });

  it("GET /api/pacts/{id} answers a pact the ledger just named, with its timeline", async () => {
    const page = await answer("GET", "/api/pacts", 200, await listPactsRoute(request("/api/pacts?limit=1")));
    const id: string = page.items[0].pact_id;

    const body = await answer("GET", "/api/pacts/{id}", 200, await pactRoute(request(`/api/pacts/${id}`), params(id)));

    expect(body.pact.pact_id).toBe(id);
    // The field the mocked suite cannot prove: `bigserial` arrives as a decimal string, not a number.
    for (const event of body.events) expect(typeof event.id).toBe("string");
  });

  it("GET /api/certificates/{id} answers a receipt that exists", async () => {
    const { rows } = await db().query<{ pact_id: string }>(
      "select pact_id from receipts order by leaf limit 1"
    );
    if (rows.length === 0) return;
    const id = rows[0].pact_id.trim();

    await answer("GET", "/api/certificates/{id}", 200, await certificateRoute(request(`/api/certificates/${id}`), params(id)));
  });

  it("POST /api/certificates/verify answers with the contract's own verdict", async () => {
    const { rows } = await db().query<{ leaf: string; proof: string[]; batch_id: string }>(
      "select leaf, proof, batch_id from receipts where batch_id is not null and proof is not null limit 1"
    );
    if (rows.length === 0 || !process.env.RECEIPT_ANCHOR_ID) return;
    const row = rows[0];

    const res = await verifyRoute(
      new Request("http://localhost/api/certificates/verify", {
        method: "POST",
        body: JSON.stringify({ batchId: Number(row.batch_id), leaf: row.leaf.trim(), proof: row.proof }),
      })
    );
    const body = await answer("POST", "/api/certificates/verify", 200, res);

    expect(typeof body.verified).toBe("boolean");
  });
});
