/**
 * Typed errors for the experiment module.
 *
 * Service methods throw these; the HTTP layer maps them to the standard
 * envelope via the router factory's `onError`.
 */

export { ModuleError } from "../../lib/errors";
import { ModuleError } from "../../lib/errors";

export class ExperimentNotFoundError extends ModuleError {
  constructor(key: string) {
    super("experiment.not_found", 404, `experiment not found: ${key}`);
    this.name = "ExperimentNotFoundError";
  }
}

export class ExperimentKeyConflictError extends ModuleError {
  constructor(key: string) {
    super(
      "experiment.key_conflict",
      409,
      `experiment key already in use: ${key}`,
    );
    this.name = "ExperimentKeyConflictError";
  }
}

export class ExperimentNotRunningError extends ModuleError {
  constructor(key: string) {
    super(
      "experiment.not_running",
      409,
      `experiment is not running: ${key}`,
    );
    this.name = "ExperimentNotRunningError";
  }
}

export class InvalidExperimentTransitionError extends ModuleError {
  constructor(from: string, to: string) {
    super(
      "experiment.invalid_transition",
      409,
      `invalid status transition: ${from} → ${to}`,
    );
    this.name = "InvalidExperimentTransitionError";
  }
}

/**
 * Thrown when traffic_allocation is malformed, doesn't sum to 100,
 * references a missing variant_key, or omits a defined variant.
 * Service produces a human-readable message; admin UI surfaces it
 * verbatim in the inline form error.
 */
export class InvalidTrafficAllocationError extends ModuleError {
  constructor(message: string) {
    super("experiment.invalid_traffic", 400, message);
    this.name = "InvalidTrafficAllocationError";
  }
}

/**
 * Thrown when the request would mutate experiment configuration that
 * is locked because the experiment is currently `running`. Examples:
 * editing `traffic_allocation`, adding / deleting variants, changing
 * `control_variant_key`. Pause first, then retry.
 */
export class ExperimentLockedError extends ModuleError {
  constructor(field: string) {
    super(
      "experiment.locked",
      409,
      `cannot modify "${field}" while experiment is running; pause first`,
    );
    this.name = "ExperimentLockedError";
  }
}

export class VariantNotFoundError extends ModuleError {
  constructor(key: string) {
    super("experiment.variant_not_found", 404, `variant not found: ${key}`);
    this.name = "VariantNotFoundError";
  }
}

export class VariantKeyConflictError extends ModuleError {
  constructor(key: string) {
    super(
      "experiment.variant_key_conflict",
      409,
      `variant key already in use within this experiment: ${key}`,
    );
    this.name = "VariantKeyConflictError";
  }
}

/**
 * Thrown when deleting a variant that has at least one assignment row.
 * Action: archive the experiment instead — assignments stay, but no
 * new bucketing happens.
 */
export class VariantInUseError extends ModuleError {
  constructor(count: number) {
    super(
      "experiment.variant_in_use",
      409,
      `variant has ${count} assignment(s); archive the experiment instead`,
    );
    this.name = "VariantInUseError";
  }
}

export class ExperimentInvalidInputError extends ModuleError {
  constructor(message: string) {
    super("experiment.invalid_input", 400, message);
    this.name = "ExperimentInvalidInputError";
  }
}
