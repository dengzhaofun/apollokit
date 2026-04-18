import { env } from "cloudflare:workers";
import { neon } from "@neondatabase/serverless";
import { upstashCache } from "drizzle-orm/cache/upstash";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";

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

export const db = isNeon
  ? drizzleNeon({ client: neon(url), schema, cache })
  : await (async () => {
      const { drizzle } = await import("drizzle-orm/postgres-js");
      const { default: postgres } = await import("postgres");
      const client = postgres(url, {
        // prepare: false → avoid the prepared-statement Bind codec that
        // chokes on Date → timestamptz. With prepare:false Drizzle sends
        // ISO strings that Postgres parses natively.
        prepare: false,
        // Pin the session to UTC so `timestamp`-without-tz columns behave
        // the same on local PG as on Neon (Neon's server runs UTC by
        // default, but a local Postgres.app on +08 would otherwise store
        // NOW() as local time and break any `col >= ${jsDate}` filter —
        // the ::timestamp cast of an ISO-with-Z string *strips* the Z
        // instead of converting.
        connection: { TimeZone: "UTC" },
      });
      const drz = drizzle({ client, schema, cache });
      // Drizzle's postgres-js driver installs a `val => val` serializer
      // for all timestamp OIDs (see drizzle-orm/postgres-js/driver.js)
      // so it can format Dates itself. That works for `gte(col, date)`
      // where Drizzle pre-stringifies, but breaks `sql\`${col} <= ${date}\``
      // raw templates — the Date slips through to postgres-js's `b.str()`
      // and throws `ERR_INVALID_ARG_TYPE`. Reinstall a Date→ISO fallback.
      const toIso = (v: unknown) =>
        v instanceof Date ? v.toISOString() : v;
      for (const oid of ["1184", "1114", "1082", "1083", "1182", "1185", "1115", "1231"]) {
        (client as unknown as { options: { serializers: Record<string, (v: unknown) => unknown> } })
          .options.serializers[oid] = toIso;
      }
      // Shape compat: `db.execute(sql\`...\`)` returns `{ rows }` on neon-http
      // and a bare array on postgres-js. The codebase reads `.rows.length`
      // (e.g. friend-gift, check-in's ON CONFLICT ... RETURNING). Attach a
      // non-enumerable `rows` pointing back to the result array so both
      // drivers quack the same.
      const origExecute = drz.execute.bind(drz);
      drz.execute = (async (query: Parameters<typeof origExecute>[0]) => {
        const result = await origExecute(query);
        if (Array.isArray(result) && !("rows" in result)) {
          Object.defineProperty(result, "rows", {
            value: result,
            enumerable: false,
            configurable: true,
          });
        }
        return result;
      }) as typeof drz.execute;
      return drz;
    })();
