import { env } from "cloudflare:workers";
import { neon } from "@neondatabase/serverless";
import { upstashCache } from "drizzle-orm/cache/upstash";
import { drizzle as drizzleNeon, type NeonHttpDatabase } from "drizzle-orm/neon-http";

import * as schema from "./schema";

const url = env.DATABASE_URL;
const isNeon = /neon\.tech/i.test(url);

const cache =
  env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
    ? upstashCache({
        url: env.UPSTASH_REDIS_REST_URL,
        token: env.UPSTASH_REDIS_REST_TOKEN,
        global: false,
      })
    : undefined;

// `db` is typed as `NeonHttpDatabase` — the production driver, and the
// shape the entire codebase was written against (`.execute(...).rows`,
// `.returning(...)`, no multi-statement transactions). Typing this as the
// true `NeonHttp | NodePg` union would degrade every `.returning()` and
// `.execute().rows` callsite via builder-chain signature intersection, so
// we cast the local-Postgres branch to the neon-http type.
//
// The local branch uses `drizzle-orm/node-postgres` (not `postgres.js`)
// because `pg`'s wire result is already `{ rows, fields, rowCount }` —
// the same shape as `NeonHttpQueryResult`. `postgres.js` would need a
// `.rows` shim over `RowList`, prepared-statement Bind tweaks, and
// per-OID timestamp serializers to match.
//
// Narrowing to `NeonHttpDatabase` also enforces the codebase's
// no-transaction rule at compile time — neon-http rejects
// `db.transaction(cb)` at runtime, and all writes go through single
// atomic `INSERT ... ON CONFLICT DO UPDATE WHERE ... RETURNING`
// statements (see apps/server/CLAUDE.md → "`neon-http` has no
// transactions", and modules/check-in/service.ts for the canonical
// pattern).
export const db: NeonHttpDatabase<typeof schema> = isNeon
  ? drizzleNeon({ client: neon(url), schema, cache })
  : await (async () => {
      const { drizzle } = await import("drizzle-orm/node-postgres");
      const { default: pg } = await import("pg");
      // Pin every new physical connection to UTC so `timestamp`-without-tz
      // columns behave the same as on Neon (which defaults to UTC server-side).
      // Without this, a local Postgres on +08 stores NOW() as local time and
      // `col >= ${jsDate}` filters drift by the TZ offset.
      //
      // `options: "-c TimeZone=UTC"` passes the setting as a libpq startup
      // parameter — set before any query runs, avoiding the pg deprecation
      // warning we'd hit by firing a `SET TIME ZONE` on the `connect` event
      // (that path calls `client.query()` while the client is still mid-startup).
      // Workers runtime binds every TCP socket to the I/O context of
      // the request that opened it — idle connections handed back to
      // a *different* request later will hang forever ("can't access
      // I/O object from a different request"). This is dev-only: in
      // production the Neon URL path above goes through the HTTP
      // driver and never creates a pool at all.
      //
      // `maxUses: 1` forces pg to destroy a connection after a single
      // `connect()/release()` cycle, making every query take a brand
      // new socket. `idleTimeoutMillis: 0` + `allowExitOnIdle: true`
      // belt-and-braces: any stragglers go away immediately. Under
      // wrangler dev the per-query reconnect cost is ~1ms on a
      // local Postgres, an acceptable trade for not-hanging.
      const pool = new pg.Pool({
        connectionString: url,
        options: "-c TimeZone=UTC",
        max: 1,
        maxUses: 1,
        idleTimeoutMillis: 0,
        allowExitOnIdle: true,
      });
      const drz = drizzle({ client: pool, schema, cache });
      return drz as unknown as NeonHttpDatabase<typeof schema>;
    })();
