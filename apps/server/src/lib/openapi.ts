/**
 * Shared OpenAPI helpers for every business router.
 *
 * Three concerns are bundled here so each module's route file stays small:
 *
 * 1. **Validation error shape.** `OpenAPIHono` exposes a `defaultHook` that
 *    fires when a Zod-validated input fails. We map it to a stable 400
 *    response (`error / code / issues / requestId`) so clients don't see
 *    the framework's default 200/400/throw behavior.
 *
 * 2. **Security scheme injection.** The platform has three auth flavors —
 *    Better Auth admin session cookie, admin `ak_` API key, and end-user
 *    `cpk_` client credential (with HMAC). `createAdminRoute` /
 *    `createClientRoute` stamp the right `security` array onto every
 *    `createRoute` call so Scalar's "Test Request" UI prompts for the
 *    correct credential and SDK generators emit per-route auth metadata.
 *
 * 3. **Auto operationId.** Hand-typing 459 unique `operationId` strings is
 *    unrealistic; missing operationIds cripple SDK generators. We derive a
 *    deterministic `${method}_${pathSlug}` if the caller doesn't override.
 *
 * All three injections are pure additions — caller-supplied `security`,
 * `operationId`, or `hide` always wins.
 */

import {
  OpenAPIHono,
  createRoute,
  type RouteConfig,
  type Hook,
} from "@hono/zod-openapi";

import type { HonoEnv } from "../env";

// ─── Validation defaultHook ──────────────────────────────────────

/**
 * Default Zod-validation failure handler shared by every router. Returning
 * a `Response` here short-circuits the route handler.
 */
export const validationDefaultHook: Hook<unknown, HonoEnv, string, unknown> = (
  result,
  c,
) => {
  if (!result.success) {
    return c.json(
      {
        error: "Validation failed",
        code: "VALIDATION_ERROR",
        issues: result.error.issues,
        requestId: c.get("requestId"),
      },
      400,
    );
  }
};

// ─── Router factories ────────────────────────────────────────────

export function createAdminRouter() {
  return new OpenAPIHono<HonoEnv>({ defaultHook: validationDefaultHook });
}

export function createClientRouter() {
  return new OpenAPIHono<HonoEnv>({ defaultHook: validationDefaultHook });
}

export function createPublicRouter() {
  return new OpenAPIHono<HonoEnv>({ defaultHook: validationDefaultHook });
}

// ─── Security schemes ────────────────────────────────────────────

export const SECURITY_SCHEMES = {
  Session: "Session",
  AdminApiKey: "AdminApiKey",
  ClientCredential: "ClientCredential",
} as const;

const ADMIN_SECURITY = [
  { [SECURITY_SCHEMES.Session]: [] },
  { [SECURITY_SCHEMES.AdminApiKey]: [] },
];

const CLIENT_SECURITY = [{ [SECURITY_SCHEMES.ClientCredential]: [] }];

/**
 * Register every security scheme on the top-level app. Must be called
 * once on the root `app` after all sub-routers are mounted but before
 * `app.doc31(...)` runs (or before any request hits `/openapi.json`).
 */
export function registerSecuritySchemes(app: OpenAPIHono<HonoEnv>) {
  app.openAPIRegistry.registerComponent("securitySchemes", "Session", {
    type: "apiKey",
    in: "cookie",
    name: "better-auth.session_token",
    description:
      "Better Auth admin session cookie (set by /api/auth/sign-in/email).",
  });
  app.openAPIRegistry.registerComponent("securitySchemes", "AdminApiKey", {
    type: "http",
    scheme: "bearer",
    bearerFormat: "ak_…",
    description:
      "Admin API key. Send as `Authorization: Bearer ak_…`. Issued via Better Auth `/api/auth/api-key`.",
  });
  app.openAPIRegistry.registerComponent("securitySchemes", "ClientCredential", {
    type: "apiKey",
    in: "header",
    name: "X-Client-Public-Key",
    description:
      "End-user client credential (cpk_…). Paired with HMAC headers `X-Client-Signature`, `X-Client-Timestamp`, and `X-Client-Nonce`.",
  });
}

// ─── operationId derivation ──────────────────────────────────────

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/\{([^}]+)\}/g, "by_$1")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

/**
 * Derive a stable operationId for a route.
 *
 * Each module router is mounted under its own base path in `src/index.ts`,
 * so two different routers can both declare `path: "/"`. The naive
 * `${method}_${pathSlug}` derivation collapses every router-root route
 * into the same `get_` / `post_` id, which collides across modules and
 * makes SDK generators emit duplicate methods.
 *
 * Prefixing with the route's first `tag` (which every module already
 * sets via the `TAG` constant) gives us a unique, human-readable id like
 * `announcement_admin_post_root` or `check_in_get_configs_by_id`.
 */
const operationIdFromRoute = (config: RouteConfig) => {
  const tagSlug = slugify(String(config.tags?.[0] ?? ""));
  const pathSlug = slugify(config.path) || "root";
  const method = config.method.toLowerCase();
  return tagSlug
    ? `${tagSlug}_${method}_${pathSlug}`
    : `${method}_${pathSlug}`;
};

// ─── Route factories ─────────────────────────────────────────────

/**
 * Wrap `createRoute` for admin-facing endpoints. Injects:
 * - `security`: Session OR AdminApiKey
 * - `operationId`: derived from tag + method + path if absent
 *
 * Caller can override either field by passing it explicitly.
 */
export function createAdminRoute<R extends RouteConfig>(config: R): R {
  return createRoute({
    ...config,
    operationId: config.operationId ?? operationIdFromRoute(config),
    security: config.security ?? ADMIN_SECURITY,
  }) as R;
}

/**
 * Wrap `createRoute` for end-user / tenant client endpoints. Injects:
 * - `security`: ClientCredential
 * - `operationId`: derived from tag + method + path if absent
 */
export function createClientRoute<R extends RouteConfig>(config: R): R {
  return createRoute({
    ...config,
    operationId: config.operationId ?? operationIdFromRoute(config),
    security: config.security ?? CLIENT_SECURITY,
  }) as R;
}

/**
 * Wrap `createRoute` for unauthenticated endpoints (health, etc).
 * Sets `security: []` to explicitly opt out of any inherited default.
 */
export function createPublicRoute<R extends RouteConfig>(config: R): R {
  return createRoute({
    ...config,
    operationId: config.operationId ?? operationIdFromRoute(config),
    security: config.security ?? [],
  }) as R;
}
