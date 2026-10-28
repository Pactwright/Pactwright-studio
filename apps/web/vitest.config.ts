import { defineConfig } from "vitest/config";
import path from "node:path";

// Unit tests only; Playwright e2e lives in test/e2e (playwright.config.ts).
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
  test: { include: ["test/unit/**/*.test.ts"] },
});
