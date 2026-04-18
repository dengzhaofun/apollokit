import { createMiddleware } from "hono/factory";

import { deps } from "../deps";
import type { HonoEnv } from "../env";
import type { AnalyticsActor } from "../lib/analytics";

/**
 * Auto-logs every Worker request to Tinybird's `http_requests` dataset.
 *
 * Mounted in `src/index.ts` AFTER `session` so `c.var.session` is
 * populated (we need `activeOrganizationId` to tag the row with the
 * correct tenant).
 *
 * Ingest runs via `ctx.waitUntil(...)` so it never blocks the response.
 * A Tinybird outage won't break the request — the writer swallows
 * errors and logs them.
 *
 * Unauthenticated paths (`/health`, `/api/auth/*`, `/`, `/docs`, …)
 * are skipped: they have no tenant and would just pollute the dataset
 * with rows we can't attribute.
 */
export const requestLog = createMiddleware<HonoEnv>(async (c, next) => {
  const start = Date.now();
  await next();

  const orgId = c.get("session")?.activeOrganizationId ?? "";
  if (!orgId) return;

  const authMethod = c.get("authMethod");
  const actor: AnalyticsActor =
    authMethod === "client-credential"
      ? "client-credential"
      : authMethod === "session"
        ? "admin"
        : authMethod === "admin-api-key"
          ? "admin"
          : "anon";

  const path = new URL(c.req.url).pathname;

  c.executionCtx.waitUntil(
    deps.analytics.writer.logHttp({
      ts: new Date(start),
      orgId,
      traceId: c.get("requestId"),
      method: c.req.method,
      path,
      status: c.res.status,
      durationMs: Date.now() - start,
      country: c.req.header("cf-ipcountry"),
      actor,
      userAgent: c.req.header("user-agent"),
    }),
  );
});
