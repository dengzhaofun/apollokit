/**
 * End-user auth SDK — wraps the `/api/client/auth/*` endpoints served by
 * the second (player-facing) Better Auth instance on the server.
 *
 * Only the cpk_ publishable key is needed to call these endpoints. The
 * player's password never leaves this client; the server stores a hash.
 *
 * MVP surface: email + password only. `signInSocial` is reserved for
 * the future social-login phase and throws today.
 *
 * Session transport
 * -----------------
 * In a browser the session rides on cookies that Better Auth sets; you
 * just call `signInEmail` once and subsequent `createClient(...)` calls
 * (and API calls) will be authenticated automatically via `credentials:
 * "include"`. In Node / a native Unity embed, pass the `token` from the
 * sign-in response into `Authorization: Bearer <token>` on business
 * requests.
 *
 * Email namespacing
 * -----------------
 * The server stores `email` as `{orgId}__{rawEmail}` to get per-tenant
 * uniqueness out of a single-column UNIQUE constraint. This file strips
 * that prefix before handing user objects back to callers, so the
 * `user.email` you see is always the email the player typed.
 */

import type { ApolloKitClientConfig } from "./client.js";
import { client } from "./generated/client.gen.js";

const EMAIL_NS_SEP = "__";

export interface SignUpEmailInput {
  email: string;
  password: string;
  name: string;
}

export interface SignInEmailInput {
  email: string;
  password: string;
}

export interface EndUserProfile {
  id: string;
  email: string;
  name: string;
  image: string | null;
  emailVerified: boolean;
  organizationId: string;
}

export interface SignInResult {
  user: EndUserProfile;
  /**
   * Bearer token — populated when the server is configured with the
   * bearer plugin (non-browser environments). Undefined in a browser
   * where the session rides on cookies.
   */
  token?: string;
}

export interface EndUserSession {
  user: EndUserProfile;
  expiresAt: string;
}

/**
 * Endpoint builder that respects `client.setConfig({ baseUrl })` from
 * `createClient`. We don't use the hey-api generated SDK here because
 * Better Auth routes are not in the OpenAPI document (they're added
 * via `auth.handler` on the server, outside the zod-openapi pipeline).
 */
function authUrl(path: string): string {
  const baseUrl = client.getConfig().baseUrl ?? "";
  return `${baseUrl}/api/client/auth${path}`;
}

function defaultHeaders(config: ApolloKitClientConfig): Headers {
  const h = new Headers({
    "content-type": "application/json",
    "x-api-key": config.publishableKey,
  });
  return h;
}

function unscopeEmail(stored: string, orgId: string): string {
  const prefix = `${orgId}${EMAIL_NS_SEP}`;
  return stored.startsWith(prefix) ? stored.slice(prefix.length) : stored;
}

function toProfile(raw: {
  id: string;
  email: string;
  name: string;
  image?: string | null;
  emailVerified?: boolean;
  organizationId: string;
}): EndUserProfile {
  return {
    id: raw.id,
    email: unscopeEmail(raw.email, raw.organizationId),
    name: raw.name,
    image: raw.image ?? null,
    emailVerified: raw.emailVerified ?? false,
    organizationId: raw.organizationId,
  };
}

async function parseJsonOrThrow(res: Response): Promise<unknown> {
  if (res.ok) {
    return res.status === 204 ? null : res.json();
  }
  let message = `HTTP ${res.status}`;
  try {
    const data = (await res.json()) as { message?: string; error?: string };
    message = data.message ?? data.error ?? message;
  } catch {
    // fall through
  }
  throw new Error(message);
}

/**
 * Register a new end-user for the current tenant.
 *
 * Requires `createClient({ publishableKey })` to have been called first.
 * Pass the player's raw email — the SDK transparently maps it to the
 * scoped form the server expects.
 */
export async function signUpEmail(
  config: ApolloKitClientConfig,
  input: SignUpEmailInput,
): Promise<SignInResult> {
  const res = await fetch(authUrl("/sign-up/email"), {
    method: "POST",
    headers: defaultHeaders(config),
    credentials: "include",
    body: JSON.stringify(input),
  });
  const data = (await parseJsonOrThrow(res)) as {
    user: Parameters<typeof toProfile>[0];
    token?: string;
  };
  return { user: toProfile(data.user), token: data.token };
}

/** Sign an existing end-user in with email + password. */
export async function signInEmail(
  config: ApolloKitClientConfig,
  input: SignInEmailInput,
): Promise<SignInResult> {
  const res = await fetch(authUrl("/sign-in/email"), {
    method: "POST",
    headers: defaultHeaders(config),
    credentials: "include",
    body: JSON.stringify(input),
  });
  const data = (await parseJsonOrThrow(res)) as {
    user: Parameters<typeof toProfile>[0];
    token?: string;
  };
  return { user: toProfile(data.user), token: data.token };
}

/** Clear the current session. Safe to call when already signed out. */
export async function signOut(config: ApolloKitClientConfig): Promise<void> {
  const res = await fetch(authUrl("/sign-out"), {
    method: "POST",
    headers: defaultHeaders(config),
    credentials: "include",
  });
  await parseJsonOrThrow(res);
}

/**
 * Fetch the current session if one exists. Returns null for signed-out
 * callers rather than throwing — the caller decides what signed-out
 * means for their flow.
 */
export async function getSession(
  config: ApolloKitClientConfig,
): Promise<EndUserSession | null> {
  const res = await fetch(authUrl("/get-session"), {
    method: "GET",
    headers: defaultHeaders(config),
    credentials: "include",
  });
  if (!res.ok) return null;
  const raw = (await res.json()) as {
    user?: Parameters<typeof toProfile>[0];
    session?: { expiresAt: string };
  } | null;
  if (!raw?.user || !raw.session) return null;
  return {
    user: toProfile(raw.user),
    expiresAt: raw.session.expiresAt,
  };
}

/** Reserved for the social-login phase. Not yet implemented. */
export function signInSocial(): Promise<never> {
  return Promise.reject(
    new Error(
      "signInSocial is not implemented in the MVP — only email/password auth is available",
    ),
  );
}
