export { ModuleError } from "../../lib/errors";
import { ModuleError } from "../../lib/errors";

/**
 * The externalId the tenant is trying to sync already belongs to a
 * different eu_user row in the same org under a different email. This
 * means the tenant passed two different emails for the same externalId
 * across calls, which would corrupt identity mapping — we refuse rather
 * than silently overwrite.
 */
export class EndUserIdentityConflict extends ModuleError {
  constructor(externalId: string) {
    super(
      "end_user.identity_conflict",
      409,
      `externalId "${externalId}" is bound to a different email in this org`,
    );
    this.name = "EndUserIdentityConflict";
  }
}

export class EndUserNotFound extends ModuleError {
  constructor(id: string) {
    super("end_user.not_found", 404, `end-user not found: ${id}`);
    this.name = "EndUserNotFound";
  }
}

export class EndUserSessionNotFound extends ModuleError {
  constructor(sessionId: string) {
    super("end_user.session_not_found", 404, `session not found: ${sessionId}`);
    this.name = "EndUserSessionNotFound";
  }
}

/**
 * Thrown by `session.create.before` in end-user-auth when a disabled
 * player tries to sign in. Admin has soft-banned them via
 * `POST /api/v1/end-user/:id/disable`.
 */
export class EndUserDisabled extends ModuleError {
  constructor(id: string) {
    super("end_user.disabled", 403, `end-user is disabled: ${id}`);
    this.name = "EndUserDisabled";
  }
}
