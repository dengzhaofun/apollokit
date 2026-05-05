import type { clientCredentials } from "../../schema/client-credential";

export type ClientCredential = typeof clientCredentials.$inferSelect;

export type ClientCredentialPublic = Omit<
  ClientCredential,
  "encryptedSecret"
>;

/**
 * Credential type. `standard` is the historical default (HMAC flow);
 * `anonymous` is provisioned for apollokit-pages projects whose authMode
 * is `anonymous` — accepts any endUserId, skips HMAC.
 */
export const CLIENT_CREDENTIAL_KINDS = ["standard", "anonymous"] as const;
export type ClientCredentialKind = (typeof CLIENT_CREDENTIAL_KINDS)[number];

export type VerifyResult = {
  valid: boolean;
  tenantId: string;
  credentialId: string;
  devMode: boolean;
  kind: ClientCredentialKind;
};
