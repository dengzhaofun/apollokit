import { ModuleError } from "../../lib/errors";

export { ModuleError };

export class ActivityNotFound extends ModuleError {
  constructor(idOrAlias: string) {
    super("activity.not_found", 404, `activity not found: ${idOrAlias}`);
  }
}

export class ActivityAliasConflict extends ModuleError {
  constructor(alias: string) {
    super(
      "activity.alias_conflict",
      409,
      `activity alias already in use: ${alias}`,
    );
  }
}

export class ActivityInvalidInput extends ModuleError {
  constructor(message: string) {
    super("activity.invalid_input", 400, message);
  }
}

export class ActivityWrongState extends ModuleError {
  constructor(action: string, currentState: string) {
    super(
      "activity.wrong_state",
      409,
      `cannot ${action}: activity is in state=${currentState}`,
    );
  }
}

export class ActivityNodeNotFound extends ModuleError {
  constructor(alias: string) {
    super("activity.node_not_found", 404, `activity node not found: ${alias}`);
  }
}

export class ActivityMilestoneNotFound extends ModuleError {
  constructor(alias: string) {
    super(
      "activity.milestone_not_found",
      404,
      `milestone not found: ${alias}`,
    );
  }
}

export class ActivityMilestoneNotReached extends ModuleError {
  constructor(alias: string, need: number, have: number) {
    super(
      "activity.milestone_not_reached",
      409,
      `milestone ${alias} requires ${need} points, have ${have}`,
    );
  }
}

export class ActivityAlreadyCompleted extends ModuleError {
  constructor() {
    super(
      "activity.already_completed",
      409,
      `activity already completed for this user`,
    );
  }
}
