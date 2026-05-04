/**
 * Records every authenticated end-user request into
 * `mau_active_player` for billing. Mirrors the
 * `request-log.ts` pattern — runs after the request handler,
 * decides whether the request counts as billable activity, and
 * fires the side-effect through `c.executionCtx.waitUntil(...)`
 * so the response is never blocked.
 *
 * Activity definition
 * -------------------
 * "Billable" = there is an end-user identity on the request AND
 * the request did not error out on the server. Specifically:
 *
 *   - `c.var.endUserId` populated (set by `requireClientUser`
 *     for `/api/v1/client/*` routes — admin / unauth requests
 *     have no end-user identity to bill against).
 *   - The team id is resolvable from either `session.activeTeamId`
 *     (admin path) or `clientCredential.tenantId` (client path).
 *   - Response status < 500. Client errors (400/401/403/404)
 *     still count — the player attempted activity, the SaaS
 *     served them; only server faults are excluded so a 5xx
 *     spike doesn't pump up the bill.
 *
 * Mount point
 * -----------
 * Global in `src/index.ts`, AFTER `requestLog` and `auditLog` so:
 *   - `c.var.endUserId` has been set by `requireClientUser` (which
 *     runs inside each client router)
 *   - we observe `c.res.status` after the handler ran
 */

import { createMiddleware } from "hono/factory";

import { deps } from "../deps";
import type { HonoEnv } from "../env";
import { trackMauActivity } from "../lib/mau/track";

export const mauTracker = createMiddleware<HonoEnv>(async (c, next) => {
  await next();

  const euId = c.get("endUserId");
  if (!euId) return;

  const teamId =
    c.get("session")?.activeTeamId ??
    c.get("clientCredential")?.tenantId ??
    null;
  if (!teamId) return;

  // Server faults don't count — see file-header rationale.
  if (c.res.status >= 500) return;

  // The KV binding is absent under vitest's `cloudflare:workers`
  // shim and during Node-only drizzle-kit invocations. Both paths
  // also lack a real `executionCtx`, so the existing try/catch
  // guard is sufficient.
  let ec: typeof c.executionCtx;
  try {
    ec = c.executionCtx;
  } catch {
    return;
  }
  const kv = (c.env as { KV?: KVNamespace }).KV;
  if (!kv) return;

  ec.waitUntil(
    trackMauActivity({
      kv,
      db: deps.db,
      teamId,
      euUserId: euId,
    }),
  );
});
