import { ModuleError } from "../../lib/errors";

export { ModuleError };

export class StorageBoxConfigNotFound extends ModuleError {
  constructor(key: string) {
    super(
      "storage_box.config_not_found",
      404,
      `storage box config not found: ${key}`,
    );
    this.name = "StorageBoxConfigNotFound";
  }
}

export class StorageBoxConfigInactive extends ModuleError {
  constructor(key: string) {
    super(
      "storage_box.config_inactive",
      409,
      `storage box config is inactive: ${key}`,
    );
    this.name = "StorageBoxConfigInactive";
  }
}

export class StorageBoxAliasConflict extends ModuleError {
  constructor(alias: string) {
    super(
      "storage_box.alias_conflict",
      409,
      `storage box alias already in use: ${alias}`,
    );
    this.name = "StorageBoxAliasConflict";
  }
}

export class StorageBoxDepositNotFound extends ModuleError {
  constructor(id: string) {
    super(
      "storage_box.deposit_not_found",
      404,
      `storage box deposit not found: ${id}`,
    );
    this.name = "StorageBoxDepositNotFound";
  }
}

export class StorageBoxCurrencyNotAccepted extends ModuleError {
  constructor(currencyId: string, boxId: string) {
    super(
      "storage_box.currency_not_accepted",
      409,
      `currency ${currencyId} is not accepted by box ${boxId}`,
    );
    this.name = "StorageBoxCurrencyNotAccepted";
  }
}

export class StorageBoxInvalidCurrency extends ModuleError {
  constructor(currencyId: string) {
    super(
      "storage_box.invalid_currency",
      400,
      `definition ${currencyId} is not a currency`,
    );
    this.name = "StorageBoxInvalidCurrency";
  }
}

export class StorageBoxLockupNotMatured extends ModuleError {
  constructor(depositId: string) {
    super(
      "storage_box.lockup_not_matured",
      409,
      `deposit ${depositId} has not reached maturity and early withdrawal is not allowed`,
    );
    this.name = "StorageBoxLockupNotMatured";
  }
}

export class StorageBoxInvalidInput extends ModuleError {
  constructor(message: string) {
    super("storage_box.invalid_input", 400, message);
    this.name = "StorageBoxInvalidInput";
  }
}

export class StorageBoxDepositOutOfRange extends ModuleError {
  constructor(message: string) {
    super("storage_box.deposit_out_of_range", 400, message);
    this.name = "StorageBoxDepositOutOfRange";
  }
}

export class StorageBoxInsufficientBalance extends ModuleError {
  constructor(depositId: string) {
    super(
      "storage_box.insufficient_balance",
      409,
      `insufficient balance in deposit ${depositId}`,
    );
    this.name = "StorageBoxInsufficientBalance";
  }
}

export class StorageBoxConcurrencyConflict extends ModuleError {
  constructor() {
    super(
      "storage_box.concurrency_conflict",
      409,
      "concurrent modification detected; retry",
    );
    this.name = "StorageBoxConcurrencyConflict";
  }
}
