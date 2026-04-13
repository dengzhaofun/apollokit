/**
 * Typed errors for the check-in module.
 *
 * Service methods throw these instead of returning `{ error }` objects or
 * raising plain `Error`s. The HTTP layer (routes.ts) maps `ModuleError`
 * instances onto JSON responses via `respondError()`.
 */
export { ModuleError } from "../../lib/errors";
import { ModuleError } from "../../lib/errors";

export class CheckInConfigNotFound extends ModuleError {
  constructor(key: string) {
    super("check_in.config_not_found", 404, `check-in config not found: ${key}`);
    this.name = "CheckInConfigNotFound";
  }
}

export class CheckInConfigInactive extends ModuleError {
  constructor(key: string) {
    super("check_in.config_inactive", 409, `check-in config is inactive: ${key}`);
    this.name = "CheckInConfigInactive";
  }
}

export class CheckInAliasConflict extends ModuleError {
  constructor(alias: string) {
    super(
      "check_in.alias_conflict",
      409,
      `check-in alias already in use in this organization: ${alias}`,
    );
    this.name = "CheckInAliasConflict";
  }
}

export class CheckInInvalidInput extends ModuleError {
  constructor(message: string) {
    super("check_in.invalid_input", 400, message);
    this.name = "CheckInInvalidInput";
  }
}
