import { env } from "cloudflare:workers";

import { db } from "./db";
import { redis } from "./redis";

/**
 * Single source of truth for all shared application dependencies.
 *
 * When a new dependency arrives (logger, event bus, unified behavior log,
 * etc.) add it to this type and to the `deps` singleton below.
 * Services declare what they need via `Pick<AppDeps, ...>` — only services
 * that actually use the new dependency have to change.
 *
 * See apps/server/CLAUDE.md for the full rule.
 */
export type AppDeps = {
  db: typeof db;
  redis: typeof redis;
  appSecret: string;
  // logger: typeof logger;
  // events: typeof events;
  // behaviorLog: typeof behaviorLog;
};

/**
 * The per-isolate singleton. Cloudflare Workers reuse module scope across
 * requests within the same isolate, so this is effectively constructed once
 * and reused for the lifetime of the isolate (same pattern as ./db).
 */
export const deps: AppDeps = {
  db,
  redis,
  appSecret: env.BETTER_AUTH_SECRET,
};
