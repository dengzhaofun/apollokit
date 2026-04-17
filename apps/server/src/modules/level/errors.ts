export { ModuleError } from "../../lib/errors";
import { ModuleError } from "../../lib/errors";

export class LevelConfigNotFound extends ModuleError {
  constructor(key: string) {
    super("level.config_not_found", 404, `level config not found: ${key}`);
    this.name = "LevelConfigNotFound";
  }
}

export class LevelStageNotFound extends ModuleError {
  constructor(id: string) {
    super("level.stage_not_found", 404, `level stage not found: ${id}`);
    this.name = "LevelStageNotFound";
  }
}

export class LevelNotFound extends ModuleError {
  constructor(id: string) {
    super("level.not_found", 404, `level not found: ${id}`);
    this.name = "LevelNotFound";
  }
}

export class LevelAliasConflict extends ModuleError {
  constructor(alias: string) {
    super("level.alias_conflict", 409, `level alias already in use: ${alias}`);
    this.name = "LevelAliasConflict";
  }
}

export class LevelLocked extends ModuleError {
  constructor(id: string) {
    super("level.locked", 403, `level is locked: ${id}`);
    this.name = "LevelLocked";
  }
}

export class LevelRewardsAlreadyClaimed extends ModuleError {
  constructor() {
    super("level.rewards_already_claimed", 409, "rewards already claimed");
    this.name = "LevelRewardsAlreadyClaimed";
  }
}

export class LevelNotCleared extends ModuleError {
  constructor() {
    super("level.not_cleared", 409, "level not yet cleared");
    this.name = "LevelNotCleared";
  }
}

export class LevelInvalidInput extends ModuleError {
  constructor(message: string) {
    super("level.invalid_input", 400, message);
    this.name = "LevelInvalidInput";
  }
}
