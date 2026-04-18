/**
 * Tenant-scoped Tinybird JWT signer.
 *
 * Pattern (confirmed against Tinybird docs):
 *   1. Backend signs a short-lived JWT with HS256 using the Tinybird
 *      workspace admin token as the signing key.
 *   2. Token payload carries `workspace_id`, `exp`, and `scopes`.
 *      Each scope pins a pipe AND injects `fixed_params.org_id`.
 *   3. Frontend hits Tinybird directly with `?token=<jwt>`. The
 *      tenant cannot modify `org_id` — Tinybird enforces it
 *      server-side when expanding the pipe template.
 *
 * We use `hono/utils/jwt/jwt` (Web Crypto, Workers-native) instead
 * of `jsonwebtoken` to avoid the node-crypto dependency.
 */

import { sign } from "hono/jwt";
import type { TenantPipeName } from "./types";

export interface TinybirdJwtConfig {
  signingKey: string;
  workspaceId: string;
}

export interface PipeGrant {
  pipe: TenantPipeName;
  /** Extra fixed params merged on top of the baked-in `org_id`. */
  fixedParams?: Record<string, string | number>;
}

export interface SignTenantTokenOptions {
  ttlSeconds?: number;
}

/**
 * Sign a JWT that lets the browser query the named pipes — and only
 * those pipes — for exactly one tenant.
 *
 * The resulting token is meant to go into the URL (`?token=...`)
 * when calling `https://api.<region>.tinybird.co/v0/pipes/<pipe>.json`.
 */
export async function signTenantToken(
  cfg: TinybirdJwtConfig,
  orgId: string,
  grants: PipeGrant[],
  opts: SignTenantTokenOptions = {},
): Promise<string> {
  const ttl = opts.ttlSeconds ?? 600;
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    workspace_id: cfg.workspaceId,
    name: `tenant:${orgId}`,
    exp: now + ttl,
    scopes: grants.map((g) => ({
      type: "PIPES:READ" as const,
      resource: g.pipe,
      fixed_params: { org_id: orgId, ...(g.fixedParams ?? {}) },
    })),
  };

  return sign(payload, cfg.signingKey, "HS256");
}
