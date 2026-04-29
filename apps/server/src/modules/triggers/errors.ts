import { ModuleError } from "../../lib/errors";

export class TriggerRuleNotFound extends ModuleError {
  constructor(id: string) {
    super("triggers.rule_not_found", 404, `trigger rule not found: ${id}`);
    this.name = "TriggerRuleNotFound";
  }
}

export class TriggerInvalidInput extends ModuleError {
  constructor(message: string) {
    super("triggers.invalid_input", 400, message);
    this.name = "TriggerInvalidInput";
  }
}

export class TriggerVersionConflict extends ModuleError {
  constructor(id: string) {
    super(
      "triggers.version_conflict",
      409,
      `trigger rule version conflict: ${id} — refetch and retry`,
    );
    this.name = "TriggerVersionConflict";
  }
}

export class TriggerActionNotImplemented extends ModuleError {
  constructor(actionType: string) {
    super(
      "triggers.action_not_implemented",
      501,
      `trigger action "${actionType}" is not implemented yet`,
    );
    this.name = "TriggerActionNotImplemented";
  }
}
