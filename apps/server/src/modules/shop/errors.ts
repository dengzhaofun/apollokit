export { ModuleError } from "../../lib/errors";
import { ModuleError } from "../../lib/errors";

export class ShopCategoryNotFound extends ModuleError {
  constructor(key: string) {
    super("shop.category_not_found", 404, `shop category not found: ${key}`);
    this.name = "ShopCategoryNotFound";
  }
}

export class ShopCategoryAliasConflict extends ModuleError {
  constructor(alias: string) {
    super(
      "shop.category_alias_conflict",
      409,
      `shop category alias already in use: ${alias}`,
    );
    this.name = "ShopCategoryAliasConflict";
  }
}

export class ShopCategoryCycle extends ModuleError {
  constructor() {
    super(
      "shop.category_cycle",
      400,
      "category parent chain would create a cycle",
    );
    this.name = "ShopCategoryCycle";
  }
}

export class ShopTagNotFound extends ModuleError {
  constructor(key: string) {
    super("shop.tag_not_found", 404, `shop tag not found: ${key}`);
    this.name = "ShopTagNotFound";
  }
}

export class ShopTagAliasConflict extends ModuleError {
  constructor(alias: string) {
    super(
      "shop.tag_alias_conflict",
      409,
      `shop tag alias already in use: ${alias}`,
    );
    this.name = "ShopTagAliasConflict";
  }
}

export class ShopProductNotFound extends ModuleError {
  constructor(key: string) {
    super("shop.product_not_found", 404, `shop product not found: ${key}`);
    this.name = "ShopProductNotFound";
  }
}

export class ShopProductAliasConflict extends ModuleError {
  constructor(alias: string) {
    super(
      "shop.product_alias_conflict",
      409,
      `shop product alias already in use: ${alias}`,
    );
    this.name = "ShopProductAliasConflict";
  }
}

export class ShopProductInactive extends ModuleError {
  constructor(productId: string) {
    super(
      "shop.product_inactive",
      409,
      `shop product is inactive: ${productId}`,
    );
    this.name = "ShopProductInactive";
  }
}

export class ShopOutsideTimeWindow extends ModuleError {
  constructor(productId: string, detail: string) {
    super(
      "shop.outside_time_window",
      409,
      `shop product not purchasable right now (${productId}): ${detail}`,
    );
    this.name = "ShopOutsideTimeWindow";
  }
}

export class ShopUserLimitReached extends ModuleError {
  constructor(productId: string) {
    super(
      "shop.user_limit_reached",
      409,
      `user purchase limit reached for product: ${productId}`,
    );
    this.name = "ShopUserLimitReached";
  }
}

export class ShopGlobalLimitReached extends ModuleError {
  constructor(productId: string) {
    super(
      "shop.global_limit_reached",
      409,
      `global purchase limit reached for product: ${productId}`,
    );
    this.name = "ShopGlobalLimitReached";
  }
}

export class ShopCycleLimitReached extends ModuleError {
  constructor(productId: string) {
    super(
      "shop.cycle_limit_reached",
      409,
      `cycle purchase limit reached for product: ${productId}`,
    );
    this.name = "ShopCycleLimitReached";
  }
}

export class ShopGrowthStageNotFound extends ModuleError {
  constructor(key: string) {
    super(
      "shop.growth_stage_not_found",
      404,
      `shop growth stage not found: ${key}`,
    );
    this.name = "ShopGrowthStageNotFound";
  }
}

export class ShopNotEntitled extends ModuleError {
  constructor(productId: string) {
    super(
      "shop.not_entitled",
      409,
      `user has not purchased this growth pack: ${productId}`,
    );
    this.name = "ShopNotEntitled";
  }
}

export class ShopGrowthTriggerUnmet extends ModuleError {
  constructor(stageId: string, detail: string) {
    super(
      "shop.growth_trigger_unmet",
      409,
      `growth stage trigger not met (${stageId}): ${detail}`,
    );
    this.name = "ShopGrowthTriggerUnmet";
  }
}

export class ShopAlreadyClaimed extends ModuleError {
  constructor(stageId: string) {
    super("shop.already_claimed", 409, `growth stage already claimed: ${stageId}`);
    this.name = "ShopAlreadyClaimed";
  }
}

export class ShopConcurrencyConflict extends ModuleError {
  constructor() {
    super(
      "shop.concurrency_conflict",
      409,
      "shop operation lost a concurrent write race — please retry",
    );
    this.name = "ShopConcurrencyConflict";
  }
}

export class ShopInvalidInput extends ModuleError {
  constructor(detail: string) {
    super("shop.invalid_input", 400, `invalid input: ${detail}`);
    this.name = "ShopInvalidInput";
  }
}
