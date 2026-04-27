/**
 * Typed accessors for `c.var.*` fields populated by the auth middleware
 * stack. These exist so handlers don't repeat `c.var.X!` non-null
 * assertions at every call site — the auth middleware (`requireAuth`,
 * `requireAdminOrApiKey`, `requireClientCredential`, `requireClientUser`)
 * is the contract that guarantees the underlying field is populated.
 *
 * The non-null assertions here are load-bearing only at the type level.
 * If you find yourself reaching for these in a route that does NOT mount
 * the corresponding middleware, you have a bug in the route — not in
 * this helper.
 */

import type { Context } from "hono";

import type { HonoEnv } from "../env";

/**
 * Active organization id for an authenticated admin request.
 * Guaranteed by `requireAuth` / `requireAdminOrApiKey`.
 */
export function getOrgId(c: Context<HonoEnv>): string {
  return c.var.session!.activeOrganizationId!;
}

/**
 * Tenant organization id resolved from the client credential.
 * Guaranteed by `requireClientCredential`.
 */
export function getClientOrgId(c: Context<HonoEnv>): string {
  return c.var.clientCredential!.organizationId;
}

/**
 * End-user id for an authenticated client request.
 * Guaranteed by `requireClientUser`.
 */
export function getEndUserId(c: Context<HonoEnv>): string {
  return c.var.endUserId!;
}
