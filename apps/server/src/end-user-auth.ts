/**
 * Second Better Auth instance — serves **game players**, not SaaS operators.
 * The admin-side instance lives in `./auth.ts`; this one is separate so the
 * two cookie domains, user pools, and plugin sets don't collide.
 *
 * Tenancy
 * -------
 * Players are scoped to an `organization` via `eu_user.tenantId`. The
 * org id is pulled out of the `cpk_` publishable key by
 * `requireClientCredential` and re-attached to the inner Better Auth
 * request via a header (`x-apollo-eu-org-id`) that we set inside the route
 * adapter in `src/index.ts`. All DB hooks below read it from there.
 *
 * Per-tenant email uniqueness via email namespacing
 * -------------------------------------------------
 * Better Auth's `emailAndPassword` plugin looks up existing users by the
 * `email` column **globally** before insert — there's no adapter hook to
 * scope that query by organization. To still support per-tenant email
 * uniqueness ("alice@x.com" can sign up in game A and game B as two
 * independent accounts), we transparently namespace the email: what we
 * store in `eu_user.email` is `{orgId}__{rawEmail}`. The DB-level
 * `UNIQUE(email)` therefore expresses `(orgId, rawEmail) UNIQUE` without
 * needing a composite key Better Auth can't describe.
 *
 * The `hooks.before` middleware rewrites `ctx.body.email` to the scoped
 * form on every endpoint that looks up users by email. On the way out,
 * the SDK (`packages/sdk-client-ts/src/auth.ts`) strips the prefix, so
 * callers only ever see the raw email.
 *
 * Header-only: the scoping header is stripped from any request that
 * didn't come through `requireClientCredential`, so a direct attacker
 * can't forge an org id.
 */

import { env } from "cloudflare:workers";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq } from "drizzle-orm";

import { db } from "./db";
import * as schema from "./schema";

/**
 * Header where `requireClientCredential` hands the cpk_-derived
 * organization id to Better Auth's request context. Private to this
 * module — any request reaching the Better Auth handler that wasn't
 * routed through `requireClientCredential` must have this header
 * stripped upstream (see `src/index.ts`).
 */
export const EU_ORG_ID_HEADER = "x-apollo-eu-org-id";

const EMAIL_NS_SEP = "__";

/** `{orgId}__{rawEmail}` — deterministic scoped email for DB storage. */
export function scopeEmail(orgId: string, rawEmail: string): string {
  return `${orgId}${EMAIL_NS_SEP}${rawEmail}`;
}

/**
 * Inverse of `scopeEmail`. Returns the raw email if the stored value is
 * scoped, or the input unchanged if it isn't (e.g. a synced user row with
 * no credential account still carries a scoped email; a raw email would
 * indicate a bug or a migration artifact — we return it verbatim rather
 * than throw, so read paths keep working).
 */
export function unscopeEmail(storedEmail: string): string {
  const idx = storedEmail.indexOf(EMAIL_NS_SEP);
  if (idx < 0) return storedEmail;
  return storedEmail.slice(idx + EMAIL_NS_SEP.length);
}

/** Endpoints that accept an email in the body and look up users by it. */
const EMAIL_LOOKUP_PATHS = new Set([
  "/sign-up/email",
  "/sign-in/email",
  "/forget-password",
  "/reset-password",
  "/send-verification-email",
  "/change-email",
]);

// Lazy via Proxy —— 见 `./auth.ts` 同样原因(Better Auth plugin chain
// + drizzle adapter init 是 startup CPU 大头)。endUserAuth 配置比 auth
// 更重(emailAndPassword + autoSignIn + 两组 hooks + additionalFields),
// 同样延迟到首次访问。
function buildEndUserAuth() {
  return betterAuth({
    basePath: "/api/client/auth",
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        ...schema,
        user: schema.euUser,
        session: schema.euSession,
        account: schema.euAccount,
        verification: schema.euVerification,
      },
    }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:3002",
      "http://localhost:3003",
      "http://localhost:3004",
      "http://localhost:3005",
      "http://localhost:3006",
      "http://localhost:3007",
      "http://localhost:3008",
      "http://localhost:3009",
      "http://localhost:3010",
      "https://apollokit-admin.limitless-ai.workers.dev",
    ],
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
    },
    user: {
      // `required: false` here — the NOT NULL guarantee comes from the DB
      // column + the `user.create.before` hook, not from Better Auth's
      // input validator. If we mark it required, Better Auth's pre-hook
      // body validation rejects sign-up before our hook ever runs,
      // because `input: false` means the client can't supply it and
      // there's no default.
      additionalFields: {
        tenantId: { type: "string", required: false, input: false },
        externalId: { type: "string", required: false, input: false },
        // Exposed here so Better Auth's drizzle-adapter picks up the
        // column (without this declaration it would be invisible to the
        // adapter and the default=false insert would still work, but
        // reads through `getSession` would strip it). `requireClientUser`
        // reads this to enforce the soft-ban on every request.
        disabled: { type: "boolean", required: false, input: false },
      },
    },
    session: {
      // Teach the drizzle adapter that `organization_id` is a real,
      // writable column. Without this, the adapter drops the value
      // injected by `session.create.before` and the DB rejects the
      // NOT NULL insert.
      additionalFields: {
        tenantId: { type: "string", required: false, input: false },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (!EMAIL_LOOKUP_PATHS.has(ctx.path)) return;
        // Support both transports:
        //   - HTTP handler  → ctx.request.headers
        //   - auth.api.*()  → ctx.headers (Better Auth normalizes the
        //     `headers` arg into ctx.headers but leaves ctx.request
        //     undefined on this path; we hit this in service tests).
        const orgId =
          ctx.headers?.get(EU_ORG_ID_HEADER) ??
          ctx.request?.headers.get(EU_ORG_ID_HEADER);
        if (!orgId) {
          throw new APIError("BAD_REQUEST", {
            message: "missing tenant context",
          });
        }
        const body = ctx.body as { email?: string; newEmail?: string } | undefined;
        if (!body) return;
        const next: Record<string, unknown> = { ...body };
        if (typeof body.email === "string") {
          next.email = scopeEmail(orgId, body.email);
        }
        if (typeof body.newEmail === "string") {
          next.newEmail = scopeEmail(orgId, body.newEmail);
        }
        return {
          context: {
            ...ctx,
            body: next,
          },
        };
      }),
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user, ctx) => {
            // `ctx` here is the AuthContext, passed directly — NOT the
            // `HookEndpointContext` used by top-level `hooks.before`. The
            // Request object lives on `ctx.request`. See
            // node_modules/better-auth/dist/db/with-hooks.mjs → createWithHooks.
            //
            // On the `auth.api.*()` transport (service tests), ctx.request
            // is undefined and the headers live on ctx.headers instead.
            const orgId =
              ctx?.request?.headers.get(EU_ORG_ID_HEADER) ??
              ctx?.headers?.get(EU_ORG_ID_HEADER);
            if (!orgId) {
              throw new APIError("BAD_REQUEST", {
                message: "cannot create end-user without tenant context",
              });
            }
            return {
              data: {
                ...user,
                tenantId: orgId,
              },
            };
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            // Denormalize tenantId onto the session so request-time
            // guards don't need an extra round-trip to eu_user. Also
            // refuse to mint a session for a disabled player — this is
            // the sign-in-time half of the soft-ban (the other half is
            // `setDisabled` deleting existing sessions).
            const [row] = await db
              .select({
                tenantId: schema.euUser.tenantId,
                disabled: schema.euUser.disabled,
              })
              .from(schema.euUser)
              .where(eq(schema.euUser.id, session.userId))
              .limit(1);
            if (!row) {
              throw new APIError("INTERNAL_SERVER_ERROR", {
                message: "cannot create session: end-user not found",
              });
            }
            if (row.disabled) {
              throw new APIError("FORBIDDEN", {
                message: "end-user is disabled",
              });
            }
            return {
              data: {
                ...session,
                tenantId: row.tenantId,
              },
            };
          },
        },
      },
    },
  });
}

type EndUserAuth = ReturnType<typeof buildEndUserAuth>;

let _endUserAuth: EndUserAuth | null = null;
function resolveEndUserAuth(): EndUserAuth {
  if (!_endUserAuth) _endUserAuth = buildEndUserAuth();
  return _endUserAuth;
}

export const endUserAuth = new Proxy({} as EndUserAuth, {
  get(_target, prop) {
    const target = resolveEndUserAuth() as unknown as Record<
      string | symbol,
      unknown
    >;
    const value = target[prop];
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(target);
    }
    return value;
  },
  has(_target, prop) {
    return prop in (resolveEndUserAuth() as unknown as object);
  },
});
