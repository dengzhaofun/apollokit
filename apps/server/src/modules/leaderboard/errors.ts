import { ModuleError } from "../../lib/errors";

export { ModuleError };

export class LeaderboardConfigNotFound extends ModuleError {
  constructor(idOrAlias: string) {
    super(
      "leaderboard.config_not_found",
      404,
      `leaderboard config not found: ${idOrAlias}`,
    );
  }
}

export class LeaderboardAliasConflict extends ModuleError {
  constructor(alias: string) {
    super(
      "leaderboard.alias_conflict",
      409,
      `leaderboard alias already in use: ${alias}`,
    );
  }
}

export class LeaderboardInvalidInput extends ModuleError {
  constructor(message: string) {
    super("leaderboard.invalid_input", 400, message);
  }
}

export class LeaderboardSnapshotExists extends ModuleError {
  constructor(cycleKey: string, scopeKey: string) {
    super(
      "leaderboard.snapshot_exists",
      409,
      `snapshot already exists for cycle=${cycleKey} scope=${scopeKey}`,
    );
  }
}
