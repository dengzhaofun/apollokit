import { ModuleError } from "../../../lib/errors";

export class KindNotRegisteredError extends ModuleError {
  constructor(kind: string) {
    super(
      "activity_kind.not_registered",
      500,
      `activity kind "${kind}" has no handler registered`,
    );
    this.name = "KindNotRegisteredError";
  }
}

export class UnsupportedCommandError extends ModuleError {
  constructor(kind: string, command: string) {
    super(
      "activity_kind.unsupported_command",
      400,
      `kind "${kind}" does not support command "${command}"`,
    );
    this.name = "UnsupportedCommandError";
  }
}
