import { defineConfig } from "vitest/config";
import path from "node:path";

// Live testnet checks only (test/live). They send real transactions, so `pnpm test` excludes them.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "./") } },
  test: { include: ["test/live/**/*.live.ts"], testTimeout: 600_000 },
});
