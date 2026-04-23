export { ModuleError } from "../../lib/errors";
import { ModuleError } from "../../lib/errors";

export class BadgeNodeNotFound extends ModuleError {
  constructor(idOrKey: string) {
    super("badge.node_not_found", 404, `badge node not found: ${idOrKey}`);
    this.name = "BadgeNodeNotFound";
  }
}

export class BadgeNodeKeyConflict extends ModuleError {
  constructor(key: string) {
    super(
      "badge.node_key_conflict",
      409,
      `badge node key already exists: ${key}`,
    );
    this.name = "BadgeNodeKeyConflict";
  }
}

export class BadgeNodeCycle extends ModuleError {
  constructor(path: string[]) {
    super(
      "badge.node_cycle",
      400,
      `badge node tree would contain a cycle: ${path.join(" -> ")}`,
    );
    this.name = "BadgeNodeCycle";
  }
}

export class BadgeInvalidSignalBinding extends ModuleError {
  constructor(reason: string) {
    super("badge.invalid_signal_binding", 400, reason);
    this.name = "BadgeInvalidSignalBinding";
  }
}

export class BadgeInvalidDismissConfig extends ModuleError {
  constructor(reason: string) {
    super("badge.invalid_dismiss_config", 400, reason);
    this.name = "BadgeInvalidDismissConfig";
  }
}

export class BadgeSignalInvalidInput extends ModuleError {
  constructor(reason: string) {
    super("badge.signal_invalid_input", 400, reason);
    this.name = "BadgeSignalInvalidInput";
  }
}

export class BadgeDismissNotAllowed extends ModuleError {
  constructor(nodeKey: string) {
    super(
      "badge.dismiss_not_allowed",
      409,
      `node ${nodeKey} has dismissMode=auto and cannot be dismissed explicitly`,
    );
    this.name = "BadgeDismissNotAllowed";
  }
}

export class BadgeTemplateNotFound extends ModuleError {
  constructor(id: string) {
    super("badge.template_not_found", 404, `badge template not found: ${id}`);
    this.name = "BadgeTemplateNotFound";
  }
}

export class BadgeSignalRegistryConflict extends ModuleError {
  constructor(pattern: string) {
    super(
      "badge.signal_registry_conflict",
      409,
      `signal registry pattern already exists: ${pattern}`,
    );
    this.name = "BadgeSignalRegistryConflict";
  }
}
