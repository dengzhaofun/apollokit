/**
 * Typed errors for the task module.
 *
 * Service methods throw these subclasses. The HTTP layer (routes.ts /
 * client-routes.ts) maps them onto JSON responses via its onError handler.
 */
export { ModuleError } from "../../lib/errors";
import { ModuleError } from "../../lib/errors";

export class TaskCategoryNotFound extends ModuleError {
  constructor(key: string) {
    super(
      "task.category_not_found",
      404,
      `task category not found: ${key}`,
    );
    this.name = "TaskCategoryNotFound";
  }
}

export class TaskDefinitionNotFound extends ModuleError {
  constructor(key: string) {
    super(
      "task.definition_not_found",
      404,
      `task definition not found: ${key}`,
    );
    this.name = "TaskDefinitionNotFound";
  }
}

export class TaskAliasConflict extends ModuleError {
  constructor(alias: string) {
    super(
      "task.alias_conflict",
      409,
      `task alias already in use: ${alias}`,
    );
    this.name = "TaskAliasConflict";
  }
}

export class TaskInvalidInput extends ModuleError {
  constructor(message: string) {
    super("task.invalid_input", 400, message);
    this.name = "TaskInvalidInput";
  }
}

export class TaskNotCompleted extends ModuleError {
  constructor() {
    super("task.not_completed", 409, "task is not completed yet");
    this.name = "TaskNotCompleted";
  }
}

export class TaskAlreadyClaimed extends ModuleError {
  constructor() {
    super("task.already_claimed", 409, "task reward already claimed");
    this.name = "TaskAlreadyClaimed";
  }
}

export class TaskAutoClaimOnly extends ModuleError {
  constructor() {
    super(
      "task.auto_claim_only",
      409,
      "task is configured as autoClaim — rewards are delivered via mail",
    );
    this.name = "TaskAutoClaimOnly";
  }
}

export class TaskPrerequisitesNotMet extends ModuleError {
  constructor() {
    super(
      "task.prerequisites_not_met",
      409,
      "prerequisite tasks are not completed",
    );
    this.name = "TaskPrerequisitesNotMet";
  }
}

export class TaskNestingTooDeep extends ModuleError {
  constructor() {
    super(
      "task.nesting_too_deep",
      400,
      "only one level of parent-child nesting is allowed",
    );
    this.name = "TaskNestingTooDeep";
  }
}
