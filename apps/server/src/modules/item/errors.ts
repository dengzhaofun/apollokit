export { ModuleError } from "../../lib/errors";
import { ModuleError } from "../../lib/errors";

export class ItemCategoryNotFound extends ModuleError {
  constructor(key: string) {
    super("item.category_not_found", 404, `item category not found: ${key}`);
    this.name = "ItemCategoryNotFound";
  }
}

export class ItemCategoryAliasConflict extends ModuleError {
  constructor(alias: string) {
    super(
      "item.category_alias_conflict",
      409,
      `item category alias already in use: ${alias}`,
    );
    this.name = "ItemCategoryAliasConflict";
  }
}

export class ItemDefinitionNotFound extends ModuleError {
  constructor(key: string) {
    super("item.definition_not_found", 404, `item definition not found: ${key}`);
    this.name = "ItemDefinitionNotFound";
  }
}

export class ItemDefinitionAliasConflict extends ModuleError {
  constructor(alias: string) {
    super(
      "item.definition_alias_conflict",
      409,
      `item definition alias already in use: ${alias}`,
    );
    this.name = "ItemDefinitionAliasConflict";
  }
}

export class ItemHoldLimitReached extends ModuleError {
  constructor(definitionId: string, holdLimit: number) {
    super(
      "item.hold_limit_reached",
      409,
      `user hold limit (${holdLimit}) reached for item: ${definitionId}`,
    );
    this.name = "ItemHoldLimitReached";
  }
}

export class ItemInsufficientBalance extends ModuleError {
  constructor(definitionId: string, required: number, available: number) {
    super(
      "item.insufficient_balance",
      409,
      `insufficient balance for item ${definitionId}: need ${required}, have ${available}`,
    );
    this.name = "ItemInsufficientBalance";
  }
}

export class ItemConcurrencyConflict extends ModuleError {
  constructor() {
    super(
      "item.concurrency_conflict",
      409,
      "concurrent modification detected, please retry",
    );
    this.name = "ItemConcurrencyConflict";
  }
}

export class ItemInvalidInput extends ModuleError {
  constructor(message: string) {
    super("item.invalid_input", 400, message);
    this.name = "ItemInvalidInput";
  }
}
