/**
 * Typed errors for the assist-pool module.
 *
 * Service methods throw these; the HTTP router maps `ModuleError`
 * instances onto JSON responses via `onError`.
 */
import { ModuleError } from "../../lib/errors";

export { ModuleError };

export class AssistPoolConfigNotFound extends ModuleError {
  constructor(key: string) {
    super(
      "assist_pool.config_not_found",
      404,
      `assist-pool config not found: ${key}`,
    );
    this.name = "AssistPoolConfigNotFound";
  }
}

export class AssistPoolInstanceNotFound extends ModuleError {
  constructor(id: string) {
    super(
      "assist_pool.instance_not_found",
      404,
      `assist-pool instance not found: ${id}`,
    );
    this.name = "AssistPoolInstanceNotFound";
  }
}

export class AssistPoolConfigInactive extends ModuleError {
  constructor(key: string) {
    super(
      "assist_pool.config_inactive",
      409,
      `assist-pool config is inactive: ${key}`,
    );
    this.name = "AssistPoolConfigInactive";
  }
}

export class AssistPoolAliasConflict extends ModuleError {
  constructor(alias: string) {
    super(
      "assist_pool.alias_conflict",
      409,
      `assist-pool alias already in use in this organization: ${alias}`,
    );
    this.name = "AssistPoolAliasConflict";
  }
}

export class AssistPoolInstanceExpired extends ModuleError {
  constructor(id: string) {
    super(
      "assist_pool.instance_expired",
      409,
      `assist-pool instance has expired: ${id}`,
    );
    this.name = "AssistPoolInstanceExpired";
  }
}

export class AssistPoolAlreadyCompleted extends ModuleError {
  constructor(id: string) {
    super(
      "assist_pool.already_completed",
      409,
      `assist-pool instance already completed: ${id}`,
    );
    this.name = "AssistPoolAlreadyCompleted";
  }
}

export class AssistPoolAssisterLimitReached extends ModuleError {
  constructor(limit: number) {
    super(
      "assist_pool.assister_limit_reached",
      409,
      `assister has already contributed the maximum ${limit} time(s) to this instance`,
    );
    this.name = "AssistPoolAssisterLimitReached";
  }
}

export class AssistPoolSelfAssistForbidden extends ModuleError {
  constructor() {
    super(
      "assist_pool.self_assist_forbidden",
      409,
      "initiator cannot assist their own pool (initiatorCanAssist=false)",
    );
    this.name = "AssistPoolSelfAssistForbidden";
  }
}

export class AssistPoolInitiatorLimitReached extends ModuleError {
  constructor(limit: number) {
    super(
      "assist_pool.initiator_limit_reached",
      409,
      `initiator already has the maximum ${limit} active instance(s)`,
    );
    this.name = "AssistPoolInitiatorLimitReached";
  }
}

export class AssistPoolInvalidInput extends ModuleError {
  constructor(message: string) {
    super("assist_pool.invalid_input", 400, message);
    this.name = "AssistPoolInvalidInput";
  }
}
