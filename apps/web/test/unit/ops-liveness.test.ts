import { describe, it, expect } from "vitest";
import { GET } from "../../app/api/ops/liveness/route";

describe("GET /api/ops/liveness", () => {
  it("returns 200 OK with status: ok and positive uptime", async () => {
    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(typeof body.uptime).toBe("number");
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });
});
