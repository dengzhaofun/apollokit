import { AsyncLocalStorage } from "node:async_hooks";

import { env } from "cloudflare:workers";
import { upstashCache } from "drizzle-orm/cache/upstash";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";

import * as schema from "./schema";

type DB = NodePgDatabase<typeof schema>;

// Per-request db lives here. Workers binds every TCP socket to the I/O
// context of the request that opened it — Hyperdrive enforces this by
// design — so we cannot share a `pg.Client` across requests. Each fetch /
// scheduled / queue handler enters `withDbContext`, which connects a
// fresh client and stashes it in this ALS store. `db` (below) is a Proxy
// that reads from here on every method access.
const dbStore = new AsyncLocalStorage<DB>();

const cache =
  env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
    ? upstashCache({
        url: env.UPSTASH_REDIS_REST_URL,
        token: env.UPSTASH_REDIS_REST_TOKEN,
        global: false,
      })
    : undefined;

// Node fallback for vitest, drizzle-kit migrations driven from Node, and
// the Better Auth CLI. None of those run inside workerd, so the I/O
// isolation rule doesn't apply and a plain `pg.Pool` is the simplest
// thing that works. Lazily constructed so that worker-runtime code paths
// never instantiate it.
let nodeFallback: DB | null = null;
function getNodeFallback(): DB {
  if (nodeFallback) return nodeFallback;
  const url = env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "db accessed outside withDbContext and DATABASE_URL is not set. " +
        "In a worker entry point, wrap your handler with withDbContext(env, ...).",
    );
  }
  // Pin every new physical connection to UTC so `timestamp`-without-tz
  // columns behave identically to production (Neon defaults to UTC
  // server-side). Without this, a local Postgres on +08 stores NOW() as
  // local time and `col >= ${jsDate}` filters drift by the TZ offset.
  const pool = new pg.Pool({
    connectionString: url,
    options: "-c TimeZone=UTC",
  });
  nodeFallback = drizzle({ client: pool, schema, cache });
  return nodeFallback;
}

function getDb(): DB {
  return dbStore.getStore() ?? getNodeFallback();
}

// `db` resolves the current request's Drizzle instance on every property
// access. Call sites (`db.select(...)`, `db.transaction(...)`,
// `db.execute(...)`, ...) are unchanged from the previous neon-http
// version — only the underlying type widens from `NeonHttpDatabase` to
// `NodePgDatabase`, which unlocks `db.transaction(cb)`.
//
// Use transactions sparingly: Hyperdrive runs in transaction-pool mode,
// so an open transaction holds a pooled connection for its full duration.
// Don't await long-running 3rd-party HTTP inside `db.transaction(...)`.
export const db = new Proxy({} as DB, {
  get(_target, prop) {
    return Reflect.get(getDb() as object, prop, getDb());
  },
  has(_target, prop) {
    return prop in (getDb() as object);
  },
});

/**
 * Wrap a worker entry-point handler so every `db.*` access inside `fn`
 * (and any awaited continuation) resolves to a freshly-connected
 * `pg.Client` pinned to the current request. Required by Hyperdrive:
 * sockets opened in one request's I/O context cannot be reused in
 * another's.
 *
 * Hyperdrive recycles the underlying connection back to its pool when
 * the request closes, so we deliberately do **not** call `client.end()`.
 *
 * When `bindings.HYPERDRIVE` is missing — vitest, Better Auth CLI, any
 * other Node entry point — we just run `fn()` and let the `db` Proxy
 * fall through to `getNodeFallback` (a plain `pg.Pool` against
 * `DATABASE_URL`). Callers stay unaware of the dual mode.
 */
export async function withDbContext<T>(
  bindings: { HYPERDRIVE?: Hyperdrive | undefined },
  fn: () => T | Promise<T>,
): Promise<T> {
  if (!bindings?.HYPERDRIVE) return fn();
  const client = new pg.Client({
    connectionString: bindings.HYPERDRIVE.connectionString,
  });
  await client.connect();
  const requestDb = drizzle({ client, schema, cache });
  return dbStore.run(requestDb, fn);
}
