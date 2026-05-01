/**
 * React variant of the apollokit end-user auth client.
 *
 * Same shape as `createApolloClientAuth` but built on `better-auth/react`,
 * so callers get the reactive `useSession()` hook plus all other better-
 * auth methods. Import from `@apollokit/client/react`.
 *
 * The fetch wiring (x-api-key injection + email un-namespacing) is
 * shared with the framework-agnostic variant via `buildApolloAuthFetch`
 * and `resolveApolloAuthBaseURL` from ./auth-client.
 */

import { createAuthClient } from "better-auth/react";

import {
  buildApolloAuthFetch,
  resolveApolloAuthBaseURL,
  type CreateApolloClientAuthConfig,
} from "./auth-client.js";

export type ApolloClientAuthReact = ReturnType<typeof createAuthClient>;

export function createApolloClientAuthReact(
  config: CreateApolloClientAuthConfig,
): ApolloClientAuthReact {
  return createAuthClient({
    baseURL: resolveApolloAuthBaseURL(config.baseURL),
    fetchOptions: {
      customFetchImpl: buildApolloAuthFetch(config.publishableKey),
    },
  });
}

export type { CreateApolloClientAuthConfig } from "./auth-client.js";
