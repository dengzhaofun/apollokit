export { createClient, signEndUser, client } from "./client.js";
export type { ApolloKitClientConfig } from "./client.js";
export { computeHmac } from "./hmac.js";
export { ApolloKitApiError, isErrorEnvelope } from "./errors.js";
export type { ApolloKitErrorEnvelope } from "./errors.js";

// End-user auth (players signing up / in). MVP: email + password only.
export {
  signUpEmail,
  signInEmail,
  signOut,
  getSession,
  signInSocial,
} from "./auth.js";
export type {
  SignUpEmailInput,
  SignInEmailInput,
  EndUserProfile,
  EndUserSession,
  SignInResult,
} from "./auth.js";

// Re-export all generated types and SDK functions
export * from "./generated/types.gen.js";
export * from "./generated/sdk.gen.js";
