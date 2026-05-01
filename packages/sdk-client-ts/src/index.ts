export { createClient, signEndUser, client } from "./client.js";
export type { ApolloKitClientConfig } from "./client.js";
export { computeHmac } from "./hmac.js";
export { ApolloKitApiError, isErrorEnvelope } from "./errors.js";
export type { ApolloKitErrorEnvelope } from "./errors.js";

// End-user auth (players signing up / in). Backed by better-auth's
// official client — see ./auth-client.ts for the full surface and the
// `@apollokit/client/react` subpath for the React-specific variant.
export {
  createApolloClientAuth,
  buildApolloAuthFetch,
  resolveApolloAuthBaseURL,
} from "./auth-client.js";
export type {
  ApolloClientAuth,
  CreateApolloClientAuthConfig,
} from "./auth-client.js";

// Re-export all generated types and SDK functions
export * from "./generated/types.gen.js";
export * from "./generated/sdk.gen.js";
