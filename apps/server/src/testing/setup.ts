/**
 * Vitest global setup — runs once per worker before any test module is
 * imported (see `setupFiles` in `vitest.config.ts`).
 *
 * Responsibility: load `.dev.vars` into `process.env` so the
 * `cloudflare-workers-shim` module can expose `DATABASE_URL` /
 * `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` to code that used to read them
 * from the wrangler-only `cloudflare:workers` module.
 *
 * We use `override: false` so that real environment variables (e.g.
 * injected by CI) always win over the file — the file is just a local dev
 * fallback.
 */
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { config } from "dotenv";

const here = dirname(fileURLToPath(import.meta.url));
config({
  path: resolve(here, "../../.dev.vars"),
  override: false,
});

if (!process.env.DATABASE_URL) {
  throw new Error(
    "[vitest setup] DATABASE_URL not set — check apps/server/.dev.vars or CI env",
  );
}
if (!process.env.BETTER_AUTH_SECRET) {
  throw new Error(
    "[vitest setup] BETTER_AUTH_SECRET not set — check apps/server/.dev.vars or CI env",
  );
}
