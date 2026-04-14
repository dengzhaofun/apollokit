export { ModuleError } from "../../lib/errors";
import { ModuleError } from "../../lib/errors";

export class LotteryPoolNotFound extends ModuleError {
  constructor(key: string) {
    super("lottery.pool_not_found", 404, `lottery pool not found: ${key}`);
    this.name = "LotteryPoolNotFound";
  }
}

export class LotteryPoolInactive extends ModuleError {
  constructor(key: string) {
    super("lottery.pool_inactive", 409, `lottery pool is inactive: ${key}`);
    this.name = "LotteryPoolInactive";
  }
}

export class LotteryPoolTimeWindowClosed extends ModuleError {
  constructor(key: string) {
    super(
      "lottery.pool_time_window_closed",
      409,
      `lottery pool is outside its active time window: ${key}`,
    );
    this.name = "LotteryPoolTimeWindowClosed";
  }
}

export class LotteryPoolAliasConflict extends ModuleError {
  constructor(alias: string) {
    super(
      "lottery.pool_alias_conflict",
      409,
      `lottery pool alias already in use: ${alias}`,
    );
    this.name = "LotteryPoolAliasConflict";
  }
}

export class LotteryPoolGlobalLimitReached extends ModuleError {
  constructor(poolId: string) {
    super(
      "lottery.pool_global_limit_reached",
      409,
      `lottery pool global pull limit reached: ${poolId}`,
    );
    this.name = "LotteryPoolGlobalLimitReached";
  }
}

export class LotteryTierNotFound extends ModuleError {
  constructor(key: string) {
    super("lottery.tier_not_found", 404, `lottery tier not found: ${key}`);
    this.name = "LotteryTierNotFound";
  }
}

export class LotteryPrizeNotFound extends ModuleError {
  constructor(key: string) {
    super("lottery.prize_not_found", 404, `lottery prize not found: ${key}`);
    this.name = "LotteryPrizeNotFound";
  }
}

export class LotteryPityRuleNotFound extends ModuleError {
  constructor(key: string) {
    super(
      "lottery.pity_rule_not_found",
      404,
      `lottery pity rule not found: ${key}`,
    );
    this.name = "LotteryPityRuleNotFound";
  }
}

export class LotteryPityRuleConflict extends ModuleError {
  constructor(poolId: string, tierId: string) {
    super(
      "lottery.pity_rule_conflict",
      409,
      `pity rule already exists for pool ${poolId} tier ${tierId}`,
    );
    this.name = "LotteryPityRuleConflict";
  }
}

export class LotteryNoPrizesAvailable extends ModuleError {
  constructor(poolId: string) {
    super(
      "lottery.no_prizes_available",
      409,
      `no active prizes with available stock in pool: ${poolId}`,
    );
    this.name = "LotteryNoPrizesAvailable";
  }
}

export class LotteryConcurrencyConflict extends ModuleError {
  constructor() {
    super(
      "lottery.concurrency_conflict",
      409,
      "concurrent pull detected, please retry",
    );
    this.name = "LotteryConcurrencyConflict";
  }
}
