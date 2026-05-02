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

export class ActivityNotInWritablePhase extends ModuleError {
  constructor(activityId: string, phase: string) {
    super(
      "activity.not_in_writable_phase",
      409,
      `activity ${activityId} is in phase=${phase}; participation requires phase=active`,
    );
  }
}

export class ActivityNotInClaimablePhase extends ModuleError {
  constructor(activityId: string, phase: string) {
    super(
      "activity.not_in_claimable_phase",
      409,
      `activity ${activityId} is in phase=${phase}; claims allowed only in {active, ended}`,
    );
  }
}

export class ActivityNodeNotFound extends ModuleError {
  constructor(alias: string) {
    super("activity.node_not_found", 404, `activity node not found: ${alias}`);
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

export class ActivityMemberNotFound extends ModuleError {
  constructor(endUserId: string) {
    super(
      "activity.member_not_found",
      404,
      `activity member not found: ${endUserId}`,
    );
  }
}

export class ActivityLeaveNotAllowed extends ModuleError {
  constructor() {
    super(
      "activity.leave_not_allowed",
      409,
      `this activity does not allow members to leave`,
    );
  }
}

export class ActivityQueueNotEnabled extends ModuleError {
  constructor() {
    super(
      "activity.queue_not_enabled",
      404,
      `queue numbers are not enabled for this activity`,
    );
  }
}

export class ActivityMemberNoQueueNumber extends ModuleError {
  constructor(endUserId: string) {
    super(
      "activity.member_no_queue_number",
      404,
      `member has no queue number: ${endUserId}`,
    );
  }
}

export class ActivityQueueAlreadyRedeemed extends ModuleError {
  constructor(endUserId: string, usedAt: Date) {
    super(
      "activity.queue_already_redeemed",
      409,
      `queue number already redeemed at ${usedAt.toISOString()} for ${endUserId}`,
    );
  }
}

export class ActivityQueueNumberExhausted extends ModuleError {
  constructor() {
    super(
      "activity.queue_number_exhausted",
      500,
      `failed to allocate a unique queue number after repeated retries; increase queue.length or reduce concurrent joins`,
    );
  }
}
