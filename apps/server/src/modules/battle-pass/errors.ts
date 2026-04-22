import { ModuleError } from "../../lib/errors";

export { ModuleError };

export class BattlePassConfigNotFound extends ModuleError {
  constructor(key: string) {
    super(
      "battle_pass.config_not_found",
      404,
      `battle pass config not found: ${key}`,
    );
    this.name = "BattlePassConfigNotFound";
  }
}

export class BattlePassCodeConflict extends ModuleError {
  constructor(code: string) {
    super(
      "battle_pass.code_conflict",
      409,
      `battle pass code already in use in this organization: ${code}`,
    );
    this.name = "BattlePassCodeConflict";
  }
}

export class BattlePassActivityConflict extends ModuleError {
  constructor(activityId: string) {
    super(
      "battle_pass.activity_conflict",
      409,
      `activity already bound to another battle pass season: ${activityId}`,
    );
    this.name = "BattlePassActivityConflict";
  }
}

export class BattlePassActivityNotFound extends ModuleError {
  constructor(activityId: string) {
    super(
      "battle_pass.activity_not_found",
      404,
      `activity not found or not of kind 'season_pass': ${activityId}`,
    );
    this.name = "BattlePassActivityNotFound";
  }
}

export class BattlePassInvalidInput extends ModuleError {
  constructor(message: string) {
    super("battle_pass.invalid_input", 400, message);
    this.name = "BattlePassInvalidInput";
  }
}

export class BattlePassRewardWindowClosed extends ModuleError {
  constructor(seasonId: string) {
    super(
      "battle_pass.reward_window_closed",
      409,
      `reward claiming window has closed for season: ${seasonId}`,
    );
    this.name = "BattlePassRewardWindowClosed";
  }
}

export class BattlePassTierNotOwned extends ModuleError {
  constructor(tierCode: string) {
    super(
      "battle_pass.tier_not_owned",
      403,
      `caller does not own tier: ${tierCode}`,
    );
    this.name = "BattlePassTierNotOwned";
  }
}

export class BattlePassLevelNotReached extends ModuleError {
  constructor(level: number, currentLevel: number) {
    super(
      "battle_pass.level_not_reached",
      409,
      `level ${level} not reached (current ${currentLevel})`,
    );
    this.name = "BattlePassLevelNotReached";
  }
}

export class BattlePassNoRewardAtLevel extends ModuleError {
  constructor(level: number, tierCode: string) {
    super(
      "battle_pass.no_reward_at_level",
      404,
      `no reward configured for level ${level} tier ${tierCode}`,
    );
    this.name = "BattlePassNoRewardAtLevel";
  }
}

export class BattlePassUnknownTier extends ModuleError {
  constructor(tierCode: string) {
    super(
      "battle_pass.unknown_tier",
      400,
      `tier code not defined in season config: ${tierCode}`,
    );
    this.name = "BattlePassUnknownTier";
  }
}
