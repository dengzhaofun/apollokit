import { env } from "cloudflare:workers";
import { neon } from "@neondatabase/serverless";
import { upstashCache } from "drizzle-orm/cache/upstash";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

const sql = neon(env.DATABASE_URL);

export const db = drizzle({
  client: sql,
  schema,
  cache: upstashCache({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
    global: false,
  }),
});
