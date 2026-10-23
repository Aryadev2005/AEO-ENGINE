import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup/db-setup.ts"],
    // Tests must never depend on (or spend) real provider credentials, even
    // if .env.local has real keys for local dev — force the deterministic
    // mock provider regardless of what's configured.
    env: { LLM_MOCK_MODE: "true" },
    // jobs.test.ts shares one `jobs` table across the real Postgres database
    // (see DATABASE_URL in .env.local) — keep test files from racing each other on it.
    fileParallelism: false,
    // jobs.test.ts does several sequential round-trips per test against a real
    // (networked) Postgres instance — the 5s default is too tight for that.
    testTimeout: 20_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
