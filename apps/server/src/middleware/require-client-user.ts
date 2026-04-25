/**
 * Middleware for C-end client routes where the caller represents a
 * specific end user. Supports **two** identification channels and
 * converges them on the same `c.var.endUserId` contract.
 *
 *   Channel A — Managed (Better Auth session)
 *   ------------------------------------------
 *   The player logged in via `/api/client/auth/sign-in/email` and we
 *   recognize a session cookie / bearer token from the end-user Better
 *   Auth instance. We pull `c.var.endUserId` from `session.userId`.
 *   The session row also carries `organizationId` (populated in
 *   `session.create.before` of the end-user-auth instance); we require
 *   it to match the cpk_-derived org id, otherwise an attacker with
 *   a leaked cross-tenant session cookie could forge access.
 *
 *   Channel B — Synced / pre-sync (HMAC)
 *   ------------------------------------
 *   Same flow as before this file was rewritten: the game client
 *   passes `x-end-user-id` + `x-user-hash`; we verify HMAC against
 *   the decrypted `csk_`. This is the path for players the tenant
 *   owns in their own user system and either pushed to us via
 *   `POST /api/users/sync` or hasn't synced at all.
 *
 * Downstream business handlers see a single contract: `c.var.endUserId`
 * is a non-empty string, `c.var.clientCredential.organizationId` is the
 * tenant. They don't need to care which channel resolved it.
 *
 * Must be mounted AFTER `requireClientCredential` — depends on
 * `c.var.clientCredential`. Auth routes themselves (`/api/client/auth/*`)
 * do NOT mount this middleware — they're the thing that *produces*
 * the end-user identity.
 */

import { createMiddleware } from "hono/factory";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import { endUserAuth } from "../end-user-auth";
import type { HonoEnv } from "../env";
import { ModuleError } from "../lib/errors";
import { clientCredentialService } from "../modules/client-credentials";

export const requireClientUser = createMiddleware<HonoEnv>(async (c, next) => {
  const cred = c.get("clientCredential");
  if (!cred) {
    return c.json(
      {
        error:
          "internal: requireClientUser mounted without requireClientCredential",
        requestId: c.get("requestId"),
      },
      500,
    );
  }

  // Channel A: end-user Better Auth session
  const session = await endUserAuth.api.getSession({
    headers: c.req.raw.headers,
  });
  if (session?.user) {
    const sessionOrgId = (session.session as { organizationId?: string })
      .organizationId;
    if (!sessionOrgId) {
      return c.json(
        {
          error: "session missing project binding",
          requestId: c.get("requestId"),
        },
        401,
      );
    }
    if (sessionOrgId !== cred.organizationId) {
      return c.json(
        {
          error: "session_tenant_mismatch",
          requestId: c.get("requestId"),
        },
        403,
      );
    }
    // Soft-ban enforcement on every request. `setDisabled` deletes
    // existing sessions so the admin's action is immediate, but a
    // session row issued microseconds before the disable call could
    // still hit this middleware — we double-check and refuse.
    const disabled = (session.user as { disabled?: boolean }).disabled;
    if (disabled) {
      return c.json(
        { error: "end_user_disabled", requestId: c.get("requestId") },
        403,
      );
    }
    c.set("endUserId", session.user.id);
    c.set("endUserAuthMethod", "session");
    return next();
  }

  // Channel B: HMAC
  const endUserId = c.req.header("x-end-user-id");
  if (!endUserId || endUserId.length === 0 || endUserId.length > 256) {
    return c.json(
      {
        error: "missing or invalid x-end-user-id header",
        requestId: c.get("requestId"),
      },
      400,
    );
  }

  const userHash = c.req.header("x-user-hash");

  try {
    await clientCredentialService.verifyRequest(
      cred.publishableKey,
      endUserId,
      userHash,
    );
  } catch (err) {
    if (err instanceof ModuleError) {
      return c.json(
        {
          error: err.message,
          code: err.code,
          requestId: c.get("requestId"),
        },
        err.httpStatus as ContentfulStatusCode,
      );
    }
    throw err;
  }

  c.set("endUserId", endUserId);
  c.set("endUserAuthMethod", "hmac");
  return next();
});
