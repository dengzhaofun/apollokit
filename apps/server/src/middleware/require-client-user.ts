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
 *   The session row also carries `tenantId` (populated in
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
 * is a non-empty string, `c.var.clientCredential.tenantId` is the
 * tenant. They don't need to care which channel resolved it.
 *
 * Must be mounted AFTER `requireClientCredential` — depends on
 * `c.var.clientCredential`. Auth routes themselves (`/api/client/auth/*`)
 * do NOT mount this middleware — they're the thing that *produces*
 * the end-user identity.
 *
 * Throws `ModuleError` subclasses so the standard envelope covers all
 * 401/403/400 paths uniformly.
 */

import { createMiddleware } from "hono/factory";

import { endUserAuth } from "../end-user-auth";
import type { HonoEnv } from "../env";
import { clientCredentialService } from "../modules/client-credentials";
import {
  EndUserDisabledError,
  InvalidEndUserHeaderError,
  TenantMismatchError,
  UnauthorizedError,
} from "./auth-errors";

export const requireClientUser = createMiddleware<HonoEnv>(async (c, next) => {
  const cred = c.get("clientCredential");
  if (!cred) {
    // Mount-order misconfiguration — surface as 500 via the global onError.
    throw new Error(
      "internal: requireClientUser mounted without requireClientCredential",
    );
  }

  // Channel A: end-user Better Auth session
  const session = await endUserAuth.api.getSession({
    headers: c.req.raw.headers,
  });
  if (session?.user) {
    const sessionOrgId = (session.session as { tenantId?: string })
      .tenantId;
    if (!sessionOrgId) {
      throw new UnauthorizedError("session missing project binding");
    }
    if (sessionOrgId !== cred.tenantId) {
      throw new TenantMismatchError();
    }
    // Soft-ban enforcement on every request. `setDisabled` deletes
    // existing sessions so the admin's action is immediate, but a
    // session row issued microseconds before the disable call could
    // still hit this middleware — we double-check and refuse.
    const disabled = (session.user as { disabled?: boolean }).disabled;
    if (disabled) throw new EndUserDisabledError();
    c.set("endUserId", session.user.id);
    c.set("endUserAuthMethod", "session");
    return next();
  }

  // Channel B: HMAC
  const endUserId = c.req.header("x-end-user-id");
  if (!endUserId || endUserId.length === 0 || endUserId.length > 256) {
    throw new InvalidEndUserHeaderError(
      "missing or invalid x-end-user-id header",
    );
  }

  const userHash = c.req.header("x-user-hash");

  // verifyRequest throws ModuleError on bad HMAC — let it propagate; the
  // router/global onError will map it to the standard envelope.
  await clientCredentialService.verifyRequest(
    cred.publishableKey,
    endUserId,
    userHash,
  );

  c.set("endUserId", endUserId);
  c.set("endUserAuthMethod", "hmac");
  return next();
});
