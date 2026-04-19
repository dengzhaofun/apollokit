export { ModuleError } from "../../lib/errors";
import { ModuleError } from "../../lib/errors";

export class CredentialNotFound extends ModuleError {
  constructor(id: string) {
    super(
      "client_credentials.not_found",
      404,
      `client credential not found: ${id}`,
    );
    this.name = "CredentialNotFound";
  }
}

export class CredentialDisabled extends ModuleError {
  constructor(key: string) {
    super(
      "client_credentials.disabled",
      401,
      `client credential is disabled: ${key}`,
    );
    this.name = "CredentialDisabled";
  }
}

export class CredentialExpired extends ModuleError {
  constructor(key: string) {
    super(
      "client_credentials.expired",
      401,
      `client credential has expired: ${key}`,
    );
    this.name = "CredentialExpired";
  }
}

export class InvalidHmac extends ModuleError {
  constructor() {
    super(
      "client_credentials.invalid_hmac",
      401,
      "invalid user hash — HMAC verification failed",
    );
    this.name = "InvalidHmac";
  }
}

export class InvalidSecret extends ModuleError {
  constructor() {
    super("client_credential.invalid_secret", 401, "invalid client secret");
    this.name = "InvalidSecret";
  }
}
