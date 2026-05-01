/**
 * End-user auth client — wraps better-auth's `createAuthClient` and
 * targets the `/api/client/auth/*` endpoints served by the player-facing
 * Better Auth instance on the apollokit server.
 *
 * Two responsibilities on top of vanilla better-auth:
 * 1. Inject the cpk_ publishable key as `x-api-key` on every request
 *    (the server's `requireClientCredential` middleware uses it to
 *    resolve the org and scope the auth handler).
 * 2. Strip the `{orgId}__` namespace prefix off `user.email` in any
 *    response body. The server stores emails as `{orgId}__{rawEmail}`
 *    for per-tenant uniqueness; the SDK consumer should never see that.
 *
 * Returns a vanilla better-auth client. All methods (`signIn.email`,
 * `signUp.email`, `signOut`, `getSession`, …) are usable per the
 * better-auth docs. When the server adds new plugins, the client picks
 * up new methods automatically without an SDK regeneration step.
 */

import { createAuthClient } from "better-auth/client";

export interface CreateApolloClientAuthConfig {
  /** Server base URL (e.g. "https://api.example.com") — without trailing slash. */
  baseURL: string;
  /** Client publishable key (cpk_ prefix). */
  publishableKey: string;
}

export type ApolloClientAuth = ReturnType<typeof createAuthClient>;

/**
 * Build a fetch implementation that injects `x-api-key` and unscopes
 * namespaced emails on the way back. Shared between the framework-
 * agnostic and React variants.
 */
export function buildApolloAuthFetch(
  publishableKey: string,
): typeof fetch {
  return async (input, init) => {
    const headers = new Headers(init?.headers ?? undefined);
    headers.set("x-api-key", publishableKey);

    const res = await fetch(input, {
      ...init,
      headers,
      credentials: init?.credentials ?? "include",
    });

    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("application/json")) return res;

    const text = await res.clone().text();
    if (!text) return res;

    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return res;
    }

    if (unscopeEmailsInPlace(body)) {
      return new Response(JSON.stringify(body), {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
      });
    }
    return res;
  };
}

const EMAIL_NS_SEP = "__";

/**
 * Walk a JSON value and rewrite any `{ email, organizationId }` object
 * (the user shape better-auth returns) so `email` no longer carries the
 * `{orgId}__` prefix. Mutates in place; returns true if anything changed.
 */
function unscopeEmailsInPlace(node: unknown): boolean {
  if (node === null || typeof node !== "object") return false;

  if (Array.isArray(node)) {
    let modified = false;
    for (const item of node) {
      if (unscopeEmailsInPlace(item)) modified = true;
    }
    return modified;
  }

  let modified = false;
  const obj = node as Record<string, unknown>;
  if (
    typeof obj.email === "string" &&
    typeof obj.organizationId === "string"
  ) {
    const prefix = `${obj.organizationId}${EMAIL_NS_SEP}`;
    if (obj.email.startsWith(prefix)) {
      obj.email = obj.email.slice(prefix.length);
      modified = true;
    }
  }
  for (const value of Object.values(obj)) {
    if (unscopeEmailsInPlace(value)) modified = true;
  }
  return modified;
}

/**
 * Build the auth-handler URL by appending the apollokit basePath to the
 * server's base URL. Mirrors `apps/server/src/end-user-auth.ts:basePath`.
 */
export function resolveApolloAuthBaseURL(baseURL: string): string {
  const trimmed = baseURL.replace(/\/$/, "");
  return `${trimmed}/api/client/auth`;
}

/**
 * Initialize a framework-agnostic apollokit auth client.
 *
 * Use this in Node, Cloudflare Workers, or browser code that doesn't
 * need React reactive sessions. For React (TanStack Start, Next, plain
 * React), import from `@apollokit/client/react` instead.
 */
export function createApolloClientAuth(
  config: CreateApolloClientAuthConfig,
): ApolloClientAuth {
  return createAuthClient({
    baseURL: resolveApolloAuthBaseURL(config.baseURL),
    fetchOptions: {
      customFetchImpl: buildApolloAuthFetch(config.publishableKey),
    },
  });
}
