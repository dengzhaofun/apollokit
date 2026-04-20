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
      // parameter — set before any query runs.
      //
      // Why not `pg.Pool`? Workers runtime binds every TCP socket to the
      // I/O context of the request that opened it. `pg.Pool` hands out
      // idle sockets to later requests; those sockets belong to an ended
      // I/O context and hang forever ("can't access I/O object from a
      // different request"). We tried `max: 1, maxUses: 1` to force
      // destroy-on-release, but concurrent callers race in the release
      // window: request B queues on `max: 1`, request A releases, and
      // B picks up the half-torn-down socket before pg finishes
      // destroying it → hang → workerd cancels after a few ms.
      //
      // Instead we open a fresh `pg.Client`, run one query, and call
      // `end()`. Every query gets its own socket that lives entirely
      // inside the opening request's I/O context. Local-Postgres connect
      // cost is ~1–2 ms, an acceptable trade for reliability. This is
      // dev-only; prod uses Neon HTTP and never creates a socket pool.
      const poolShim = {
        async query(
          text: string | { text: string; values?: unknown[] },
          values?: unknown[],
        ) {
          const client = new pg.Client({
            connectionString: url,
            options: "-c TimeZone=UTC",
          });
          await client.connect();
          try {
            return await client.query(
              text as string,
              values as unknown[],
            );
          } finally {
            await client.end();
          }
        },
        async end() {},
      };
      const drz = drizzle({
        client: poolShim as unknown as pg.Pool,
        schema,
        cache,
      });
      return drz as unknown as NeonHttpDatabase<typeof schema>;
    })();
