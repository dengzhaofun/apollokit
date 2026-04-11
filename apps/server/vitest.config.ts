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
    // Neon HTTP cold-starts can take 1–2s; sign-up + org-create flows
    // stack several round-trips, so give them headroom.
    hookTimeout: 30_000,
    testTimeout: 30_000,
    // Run test files sequentially so two files can't seed overlapping
    // test orgs into the same Neon branch. Inside a file, Vitest runs
    // tests serially by default — that's fine.
    fileParallelism: false,
  },
});
