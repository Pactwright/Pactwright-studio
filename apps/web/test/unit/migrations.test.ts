import { describe, expect, it } from "vitest";
import { runMigrations } from "../../../../migrations/migrate.mjs";
import { runSeed } from "../../../../migrations/seed.mjs";

describe("migrations workflow", () => {
  it("rejects runMigrations if DATABASE_URL is not provided", async () => {
    await expect(runMigrations("")).rejects.toThrow("DATABASE_URL environment variable is required");
  });

  it("rejects runSeed if DATABASE_URL is not provided", async () => {
    await expect(runSeed("")).rejects.toThrow("DATABASE_URL environment variable is required");
  });
});
