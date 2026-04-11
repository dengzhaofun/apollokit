/**
 * Vitest-only replacement for the `cloudflare:workers` virtual module.
 *
 * Our production code does `import { env } from "cloudflare:workers"` inside
 * `src/db.ts` and `src/auth.ts`. That import only resolves under wrangler /
 * workerd. Vitest runs in plain Node, so `vitest.config.ts` aliases
 * `cloudflare:workers` to this file for tests only — wrangler builds never
 * see it.
 *
 * We expose `env` as a lazy getter over `process.env` so that the vitest
 * setup file can populate `process.env` from `.dev.vars` BEFORE any test
 * module evaluates. If we used a plain object literal at module-load time,
 * the values would be captured when this file is first imported, which may
 * happen before setup runs.
 */
export const env = {
  get DATABASE_URL() {
    return process.env.DATABASE_URL!;
  },
  get BETTER_AUTH_SECRET() {
    return process.env.BETTER_AUTH_SECRET!;
  },
  get BETTER_AUTH_URL() {
    return process.env.BETTER_AUTH_URL ?? "http://localhost:8787";
  },
};
