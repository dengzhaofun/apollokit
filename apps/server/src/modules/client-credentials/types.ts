import type { clientCredentials } from "../../schema/client-credential";

export type ClientCredential = typeof clientCredentials.$inferSelect;

export type ClientCredentialPublic = Omit<
  ClientCredential,
  "encryptedSecret"
>;

export type VerifyResult = {
  valid: boolean;
  tenantId: string;
  credentialId: string;
  devMode: boolean;
};
