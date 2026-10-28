import { defineConfig } from "vitest/config";

// Unit tests only; Playwright e2e lives in test/e2e (playwright.config.ts).
export default defineConfig({
  test: { include: ["test/unit/**/*.test.ts"] },
});
