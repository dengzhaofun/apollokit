// Node-side auth config for the @better-auth/cli `generate` command.
// The runtime auth instance lives in src/auth.ts and uses Cloudflare Workers
// env via `cloudflare:workers`, which doesn't resolve in Node. This file
// mirrors the same config shape but reads from process.env so the CLI can
// introspect the schema. Loaded by `dotenv -e .dev.vars` in package.json.
import { neon } from "@neondatabase/serverless";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./src/schema";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle({ client: sql, schema });

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  secret: process.env.BETTER_AUTH_SECRET ?? "cli-only-secret",
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:8787",
  emailAndPassword: {
    enabled: true,
  },
  plugins: [organization()],
});
