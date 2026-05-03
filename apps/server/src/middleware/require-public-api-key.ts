/**
 * Public API guard — for `/api/v1/projects/:projectId/*` routes.
 *
 * Two checks combined:
 *   1. Authenticate `x-api-key` against Better Auth apikey plugin.
 *   2. Validate the key's `metadata.teamId` matches the `:projectId`
 *      path parameter — this is what makes URLs like
 *      `/api/v1/projects/A/activity` reject keys scoped to project B.
 *
 * On success, synthesizes the same `session` shape the admin path uses
 * so the existing module routers and `requirePermission` middleware
 * work without any changes.
 *
 * Public API explicitly does NOT accept session cookies — only api keys.
 * Browser clients should use the admin path `/api/<module>/*` instead.
 */

import { createMiddleware } from "hono/factory";

import { auth } from "../auth";
import type { HonoEnv } from "../env";
import { UnauthorizedError } from "./auth-errors";

export const requirePublicApiKey = createMiddleware<HonoEnv>(
  async (c, next) => {
    const projectId = c.req.param("projectId");
    if (!projectId) throw new UnauthorizedError();

    const apiKeyHeader = c.req.header("x-api-key");
    if (!apiKeyHeader) throw new UnauthorizedError();

    const result = await auth.api.verifyApiKey({
      body: { key: apiKeyHeader, configId: "admin" },
    });
    if (!result.valid || !result.key) throw new UnauthorizedError();

    const teamId = readTeamIdFromMetadata(
      (result.key as { metadata?: unknown }).metadata,
    );
    // The key's metadata MUST point at the URL's project. This is
    // exactly what blocks key-from-project-A from working on
    // /api/v1/projects/B/* — they're different teamIds.
    if (!teamId || teamId !== projectId) throw new UnauthorizedError();

    c.set("session", {
      activeOrganizationId: result.key.referenceId,
      activeTeamId: projectId,
    } as NonNullable<typeof c.var.session>);
    c.set("user", null);
    c.set("authMethod", "admin-api-key");
    return next();
  },
);

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
