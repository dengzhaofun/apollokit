/**
 * Guard for admin-side business routes.
 *
 * Accepts EITHER:
 * 1. A valid Better Auth session with an active project (`activeTeamId`), OR
 * 2. A valid admin API key (configId "admin") in the x-api-key header,
 *    pinned to a single project via `metadata.teamId`.
 *
 * In the dual-tenant model the api key plugin's `references` is still
 * `"organization"` (Better Auth 1.6 doesn't accept `"team"`), so the
 * key carries its project scope in `metadata.teamId` — this is the
 * mechanism plan §2.3 / spike-2 chose:
 *
 *   1. Admin UI creating a key MUST stamp `metadata.teamId = activeTeamId`.
 *   2. This middleware reads `metadata.teamId` after `verifyApiKey` and
 *      synthesizes `c.var.session = { activeOrganizationId, activeTeamId }`
 *      so downstream handlers (require-permission, business modules) work
 *      identically to a session-authenticated request.
 *   3. A key without `metadata.teamId` is treated as legacy/unscoped
 *      and rejected — operators rotate by deleting + creating a new key
 *      while a project is active.
 *
 * Mount per-router, not globally.
 */

import { createMiddleware } from "hono/factory";

import { auth } from "../auth";
import type { HonoEnv } from "../env";
import { UnauthorizedError } from "./auth-errors";

export const requireAdminOrApiKey = createMiddleware<HonoEnv>(
  async (c, next) => {
    // Path 0: already authenticated by an upstream middleware
    // (e.g. `requirePublicApiKey` on `/api/v1/projects/:projectId/*`).
    // Short-circuit so we don't double-verify.
    if (c.var.authMethod === "admin-api-key" && c.var.session?.activeTeamId) {
      return next();
    }

    // Path 1: session auth (resolved by global session middleware).
    // require-auth.ts already guards activeTeamId for routes that mount
    // it; here we still accept session-only requests so endpoints that
    // need only requireAdminOrApiKey (without the stricter requireAuth)
    // keep working.
    if (c.var.user && c.var.session?.activeTeamId) {
      return next();
    }

    // Path 2: admin API key.
    const apiKeyHeader = c.req.header("x-api-key");
    if (apiKeyHeader) {
      const result = await auth.api.verifyApiKey({
        body: { key: apiKeyHeader, configId: "admin" },
      });
      if (result.valid && result.key) {
        const teamId = readTeamIdFromMetadata(
          (result.key as { metadata?: unknown }).metadata,
        );
        if (!teamId) {
          // Legacy / unscoped key — refuse rather than let it act as a
          // company-wide superuser. Operators rotate by deleting +
          // creating a new key while a project is active.
          throw new UnauthorizedError();
        }

        c.set("session", {
          activeOrganizationId: result.key.referenceId,
          activeTeamId: teamId,
        } as NonNullable<typeof c.var.session>);
        c.set("user", null);
        c.set("authMethod", "admin-api-key");
        return next();
      }
    }

    throw new UnauthorizedError();
  },
);

/**
 * The Better Auth apikey plugin stores `metadata` as a JSON string but
 * may return it parsed depending on version. Normalize and pluck `teamId`.
 */
function readTeamIdFromMetadata(raw: unknown): string | null {
  let metadata: Record<string, unknown> | null = null;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      metadata =
        parsed && typeof parsed === "object"
          ? (parsed as Record<string, unknown>)
          : null;
    } catch {
      metadata = null;
    }
  } else if (raw && typeof raw === "object") {
    metadata = raw as Record<string, unknown>;
  }
  if (!metadata) return null;
  return typeof metadata.teamId === "string" ? metadata.teamId : null;
}
