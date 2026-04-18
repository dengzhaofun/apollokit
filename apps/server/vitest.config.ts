import { defineConfig } from "vitest/config";

/**
 * Vitest config for apps/server.
 *
 * Two non-obvious things:
 *
 * 1. `alias['cloudflare:workers']` — our production code imports `env`
 *    from the wrangler-only virtual module `cloudflare:workers`
 *    (`src/db.ts`, `src/auth.ts`). Vitest runs in plain Node, so we
 *    redirect that import to a local shim that reads `process.env`.
 *    This keeps the production code untouched and avoids pulling in
 *    `@cloudflare/vitest-pool-workers` — we have no workers-only APIs
 *    (KV / DO / R2 / AI) yet, so running in Node is faster and simpler.
 *
 * 2. `setupFiles: ['./src/testing/setup.ts']` — loads `.dev.vars` into
 *    `process.env` BEFORE the shim's `env` getters are read by the
 *    first test module. The shim uses lazy getters for exactly this
 *    reason.
 *
 * Tests hit the real Neon dev branch configured in `.dev.vars`. We
 * intentionally do NOT mock the database: the neon-http upsert logic
 * in the check-in service relies on real Postgres semantics
 * (`ON CONFLICT ... DO UPDATE ... WHERE`), and mocks would hide the
 * concurrency bugs those semantics exist to catch.
 */
export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    setupFiles: ["./src/testing/setup.ts"],
    alias: {
      "cloudflare:workers": new URL(
        "./src/testing/cloudflare-workers-shim.ts",
        import.meta.url,
      ).pathname,
    },
    hookTimeout: 30_000,
    testTimeout: 30_000,
    // Local PG handles parallel connections fine; each test file seeds its
    // own org with a random UUID via createTestOrg, so no collision risk.
    fileParallelism: true,
    // Stop on first failing test to shorten the feedback loop.
    bail: 1,
  },
});
