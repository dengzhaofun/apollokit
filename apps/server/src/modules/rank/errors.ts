import { ModuleError } from "../../lib/errors";

export { ModuleError };

export class RankTierConfigNotFound extends ModuleError {
  constructor(idOrAlias: string) {
    super(
      "rank.tier_config_not_found",
      404,
      `rank tier config not found: ${idOrAlias}`,
    );
  }
}

export class RankTierConfigAliasConflict extends ModuleError {
  constructor(alias: string) {
    super(
      "rank.tier_config_alias_conflict",
      409,
      `rank tier config alias already in use: ${alias}`,
    );
  }
}

export class RankTierNotFound extends ModuleError {
  constructor(tierId: string) {
    super("rank.tier_not_found", 404, `rank tier not found: ${tierId}`);
  }
}

export class RankSeasonNotFound extends ModuleError {
  constructor(idOrAlias: string) {
    super("rank.season_not_found", 404, `rank season not found: ${idOrAlias}`);
  }
}

export class RankSeasonNotActive extends ModuleError {
  constructor(seasonId: string, status: string) {
    super(
      "rank.season_not_active",
      409,
      `rank season not active: ${seasonId} (status=${status})`,
    );
  }
}

export class RankSeasonOverlap extends ModuleError {
  constructor(tierConfigId: string) {
    super(
      "rank.season_overlap",
      409,
      `another active season already exists for tier config ${tierConfigId}`,
    );
  }
}

export class RankPlayerStateNotFound extends ModuleError {
  constructor(seasonId: string, endUserId: string) {
    super(
      "rank.player_state_not_found",
      404,
      `rank player state not found for season=${seasonId} user=${endUserId}`,
    );
  }
}

/**
 * settleMatch 里同一 (org, externalMatchId) 已结算时抛出。
 *
 * NOTE: C 端 /settle 路由不直接把它映射成 409，而是捕获后用 200 +
 * `alreadySettled=true` 返回（对 SDK 重试更友好）。Admin / 内部调用
 * 路径若需要显式错误，可依赖这个类型。
 */
export class RankMatchAlreadySettled extends ModuleError {
  constructor(externalMatchId: string) {
    super(
      "rank.match_already_settled",
      409,
      `match already settled: ${externalMatchId}`,
    );
  }
}

export class RankInvalidParticipants extends ModuleError {
  constructor(message: string) {
    super("rank.invalid_participants", 400, message);
  }
}

export class RankInvalidInput extends ModuleError {
  constructor(message: string) {
    super("rank.invalid_input", 400, message);
  }
}

export class RankInvalidTierConfig extends ModuleError {
  constructor(message: string) {
    super("rank.invalid_tier_config", 400, message);
  }
}
