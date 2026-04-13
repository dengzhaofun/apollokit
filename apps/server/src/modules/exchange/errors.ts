export { ModuleError } from "../../lib/errors";
import { ModuleError } from "../../lib/errors";

export class ExchangeConfigNotFound extends ModuleError {
  constructor(key: string) {
    super("exchange.config_not_found", 404, `exchange config not found: ${key}`);
    this.name = "ExchangeConfigNotFound";
  }
}

export class ExchangeConfigInactive extends ModuleError {
  constructor(key: string) {
    super("exchange.config_inactive", 409, `exchange config is inactive: ${key}`);
    this.name = "ExchangeConfigInactive";
  }
}

export class ExchangeConfigAliasConflict extends ModuleError {
  constructor(alias: string) {
    super(
      "exchange.config_alias_conflict",
      409,
      `exchange config alias already in use: ${alias}`,
    );
    this.name = "ExchangeConfigAliasConflict";
  }
}

export class ExchangeOptionNotFound extends ModuleError {
  constructor(key: string) {
    super("exchange.option_not_found", 404, `exchange option not found: ${key}`);
    this.name = "ExchangeOptionNotFound";
  }
}

export class ExchangeOptionInactive extends ModuleError {
  constructor(key: string) {
    super("exchange.option_inactive", 409, `exchange option is inactive: ${key}`);
    this.name = "ExchangeOptionInactive";
  }
}

export class ExchangeUserLimitReached extends ModuleError {
  constructor(optionId: string) {
    super(
      "exchange.user_limit_reached",
      409,
      `user exchange limit reached for option: ${optionId}`,
    );
    this.name = "ExchangeUserLimitReached";
  }
}

export class ExchangeGlobalLimitReached extends ModuleError {
  constructor(optionId: string) {
    super(
      "exchange.global_limit_reached",
      409,
      `global exchange limit reached for option: ${optionId}`,
    );
    this.name = "ExchangeGlobalLimitReached";
  }
}
