/**
 * Auth-layer ModuleError subclasses. Auth middleware throws these so the
 * standard envelope (`{code, data, message, requestId}`) — emitted by the
 * router-factory `onError` (`lib/openapi.ts → attachErrorHandler`) and the
 * global `app.onError` (`src/index.ts`) — covers 401/400/403 too.
 *
 * Without these, middleware was returning ad-hoc `{error, requestId}`
 * shapes that SDK consumers had to special-case alongside the real
 * envelope.
 */

import { ModuleError } from "../lib/errors";

export class UnauthorizedError extends ModuleError {
  constructor(message = "unauthorized") {
    super("unauthorized", 401, message);
  }
}

export class NoActiveProjectError extends ModuleError {
  constructor(message = "no active project") {
    super("no_active_project", 400, message);
  }
}

export class TenantMismatchError extends ModuleError {
  constructor() {
    super(
      "session_tenant_mismatch",
      403,
      "session organization does not match credential",
    );
  }
}

export class EndUserDisabledError extends ModuleError {
  constructor() {
    super("end_user_disabled", 403, "end user is disabled");
  }
}

export class InvalidClientCredentialError extends ModuleError {
  constructor(message: string) {
    super("invalid_client_credential", 401, message);
  }
}

export class InvalidEndUserHeaderError extends ModuleError {
  constructor(message: string) {
    super("invalid_end_user_header", 400, message);
  }
}
