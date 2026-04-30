// Node-side auth config for the @better-auth/cli `generate` command.
// The runtime auth instance lives in src/auth.ts and uses Cloudflare Workers
// env via `cloudflare:workers`, which doesn't resolve in Node. This file
// mirrors the same config shape but reads from process.env so the CLI can
// introspect the schema. Loaded by `dotenv -e .dev.vars` in package.json.
//
// What lives in this file (vs auth.ts):
//   Anything that affects the *schema* — plugin list, email/password
//   toggle, social providers (which back the `account` table). Runtime-only
//   config (secondaryStorage, rateLimit, cookieCache, sendVerificationEmail
//   hook bodies, databaseHooks) lives in auth.ts and is intentionally NOT
//   mirrored here, since the CLI never executes those code paths.
import { apiKey } from "@better-auth/api-key";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
  haveIBeenPwned,
  lastLoginMethod,
  organization,
} from "better-auth/plugins";
import { emailHarmony } from "better-auth-harmony";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import * as schema from "./src/schema";

// Same `pg` driver as the worker runtime (via `withDbContext` in src/db.ts);
// Better Auth CLI runs in Node so a plain `Pool` is fine — no Hyperdrive
// indirection needed.
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL! });
const db = drizzle({ client: pool, schema });

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  secret: process.env.BETTER_AUTH_SECRET ?? "cli-only-secret",
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:8787",
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    organization(),
    apiKey([
      {
        configId: "admin",
        defaultPrefix: "ak_",
        references: "organization",
      },
    ]),
    // Block compromised passwords against haveibeenpwned (k-anonymous, no
    // password leaves the worker).
    haveIBeenPwned(),
    // Cookie-only (storeInDatabase defaults to false) — daveyplate AuthView
    // reads `better-auth.last_used_login_method` to highlight last-used
    // sign-in button.
    lastLoginMethod(),
    // Normalizes email on write (gmail dot/plus aliases, googlemail) and
    // adds `user.normalizedEmail` (unique) to prevent duplicate signups.
    emailHarmony(),
  ],
});
