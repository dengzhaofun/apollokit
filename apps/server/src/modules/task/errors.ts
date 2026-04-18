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

export class TaskTierNotFound extends ModuleError {
  constructor(alias: string) {
    super("task.tier_not_found", 404, `reward tier not found: ${alias}`);
    this.name = "TaskTierNotFound";
  }
}

export class TaskTierNotReached extends ModuleError {
  constructor() {
    super(
      "task.tier_not_reached",
      409,
      "task progress has not reached this tier threshold",
    );
    this.name = "TaskTierNotReached";
  }
}

export class TaskNotAssignable extends ModuleError {
  constructor(reason: string) {
    super("task.not_assignable", 400, `task not assignable: ${reason}`);
    this.name = "TaskNotAssignable";
  }
}

export class TaskAssignmentNotFound extends ModuleError {
  constructor(endUserId: string) {
    super(
      "task.assignment_not_found",
      404,
      `no active assignment for end user: ${endUserId}`,
    );
    this.name = "TaskAssignmentNotFound";
  }
}

export class TaskAssignmentBatchTooLarge extends ModuleError {
  constructor(size: number, max: number) {
    super(
      "task.assignment_batch_too_large",
      400,
      `assignment batch too large: ${size} > max ${max}`,
    );
    this.name = "TaskAssignmentBatchTooLarge";
  }
}
