export { ModuleError } from "../../lib/errors";
import { ModuleError } from "../../lib/errors";

export class CurrencyNotFound extends ModuleError {
  constructor(key: string) {
    super("currency.not_found", 404, `currency not found: ${key}`);
    this.name = "CurrencyNotFound";
  }
}

export class CurrencyAliasConflict extends ModuleError {
  constructor(alias: string) {
    super(
      "currency.alias_conflict",
      409,
      `currency alias already in use: ${alias}`,
    );
    this.name = "CurrencyAliasConflict";
  }
}

export class CurrencyInsufficientBalance extends ModuleError {
  constructor(currencyId: string, required: number, available: number) {
    super(
      "currency.insufficient_balance",
      409,
      `insufficient balance for currency ${currencyId}: need ${required}, have ${available}`,
    );
    this.name = "CurrencyInsufficientBalance";
  }
}

export class CurrencyConcurrencyConflict extends ModuleError {
  constructor() {
    super(
      "currency.concurrency_conflict",
      409,
      "concurrent modification detected, please retry",
    );
    this.name = "CurrencyConcurrencyConflict";
  }
}

export class CurrencyInvalidInput extends ModuleError {
  constructor(message: string) {
    super("currency.invalid_input", 400, message);
    this.name = "CurrencyInvalidInput";
  }
}
