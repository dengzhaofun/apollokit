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
  get UPSTASH_REDIS_REST_URL() {
    return process.env.UPSTASH_REDIS_REST_URL!;
  },
  get UPSTASH_REDIS_REST_TOKEN() {
    return process.env.UPSTASH_REDIS_REST_TOKEN!;
  },
  get ADMIN_URL() {
    return process.env.ADMIN_URL ?? "http://localhost:3000";
  },
  get INVITE_FROM_ADDRESS() {
    return process.env.INVITE_FROM_ADDRESS ?? "invites@localhost";
  },
  get TINYBIRD_TOKEN() {
    return process.env.TINYBIRD_TOKEN!;
  },
  get TINYBIRD_URL() {
    return process.env.TINYBIRD_URL!;
  },
  get TINYBIRD_WORKSPACE_ID() {
    return process.env.TINYBIRD_WORKSPACE_ID!;
  },
  get OPENROUTER_API_KEY() {
    return process.env.OPENROUTER_API_KEY!;
  },
  get GOOGLE_CLIENT_ID() {
    return process.env.GOOGLE_CLIENT_ID ?? "";
  },
  get GOOGLE_CLIENT_SECRET() {
    return process.env.GOOGLE_CLIENT_SECRET ?? "";
  },
  // EMAIL binding is intentionally omitted — tests run against a
  // real Neon branch but never through a real Email Service. The
  // mailer falls back to `console.log` when this is undefined, which
  // is what we want for CI / `pnpm test`. Tests that need to assert
  // on the send call use `vi.doMock("cloudflare:workers", ...)` per-case.

  // KV binding is faked with a per-process in-memory Map — Better Auth's
  // `secondaryStorage` (session cookieCache fallback + rateLimit counters)
  // calls .get / .put / .delete on it, and we don't want every test
  // setting up a real KV. Stale data between test files is fine because
  // `fileParallelism: false` serializes test files and each file uses a
  // fresh org id from `createTestOrg`. Within a file the cache may carry
  // a few rate-limit counters across cases — bump rateLimit.max if a
  // single-file test ever hits the limit.
  KV: makeFakeKV(),
};

interface FakeKVEntry {
  value: string;
  expiresAt: number | null;
}

function makeFakeKV() {
  const store = new Map<string, FakeKVEntry>();

  function isExpired(entry: FakeKVEntry): boolean {
    return entry.expiresAt !== null && entry.expiresAt <= Date.now();
  }

  return {
    async get(key: string): Promise<string | null> {
      const entry = store.get(key);
      if (!entry) return null;
      if (isExpired(entry)) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    async put(
      key: string,
      value: string,
      options?: { expirationTtl?: number },
    ): Promise<void> {
      const ttl = options?.expirationTtl;
      store.set(key, {
        value,
        expiresAt: typeof ttl === "number" ? Date.now() + ttl * 1000 : null,
      });
    },
    async delete(key: string): Promise<void> {
      store.delete(key);
    },
  };
}
