export { ModuleError } from "../../lib/errors";
import { ModuleError } from "../../lib/errors";

export class CdkeyBatchNotFound extends ModuleError {
  constructor(key: string) {
    super("cdkey.batch_not_found", 404, `cdkey batch not found: ${key}`);
    this.name = "CdkeyBatchNotFound";
  }
}

export class CdkeyBatchAliasConflict extends ModuleError {
  constructor(alias: string) {
    super(
      "cdkey.batch_alias_conflict",
      409,
      `cdkey batch alias already in use: ${alias}`,
    );
    this.name = "CdkeyBatchAliasConflict";
  }
}

export class CdkeyBatchInactive extends ModuleError {
  constructor(key: string) {
    super("cdkey.batch_inactive", 409, `cdkey batch is inactive: ${key}`);
    this.name = "CdkeyBatchInactive";
  }
}

export class CdkeyBatchNotStarted extends ModuleError {
  constructor(key: string) {
    super("cdkey.batch_not_started", 409, `cdkey batch has not started: ${key}`);
    this.name = "CdkeyBatchNotStarted";
  }
}

export class CdkeyBatchExpired extends ModuleError {
  constructor(key: string) {
    super("cdkey.batch_expired", 409, `cdkey batch has expired: ${key}`);
    this.name = "CdkeyBatchExpired";
  }
}

export class CdkeyTotalLimitReached extends ModuleError {
  constructor(batchId: string) {
    super(
      "cdkey.total_limit_reached",
      409,
      `cdkey batch total limit reached: ${batchId}`,
    );
    this.name = "CdkeyTotalLimitReached";
  }
}

export class CdkeyUserLimitReached extends ModuleError {
  constructor(batchId: string) {
    super(
      "cdkey.user_limit_reached",
      409,
      `cdkey per-user limit reached for batch: ${batchId}`,
    );
    this.name = "CdkeyUserLimitReached";
  }
}

export class CdkeyInvalidCode extends ModuleError {
  constructor() {
    super("cdkey.invalid_code", 404, `cdkey code is invalid`);
    this.name = "CdkeyInvalidCode";
  }
}

export class CdkeyCodeAlreadyRedeemed extends ModuleError {
  constructor(codeId: string) {
    super(
      "cdkey.code_already_redeemed",
      409,
      `cdkey code has already been redeemed: ${codeId}`,
    );
    this.name = "CdkeyCodeAlreadyRedeemed";
  }
}

export class CdkeyCodeRevoked extends ModuleError {
  constructor(codeId: string) {
    super("cdkey.code_revoked", 409, `cdkey code has been revoked: ${codeId}`);
    this.name = "CdkeyCodeRevoked";
  }
}

export class CdkeyCodeNotFound extends ModuleError {
  constructor(codeId: string) {
    super("cdkey.code_not_found", 404, `cdkey code not found: ${codeId}`);
    this.name = "CdkeyCodeNotFound";
  }
}

export class CdkeyUniversalCodeConflict extends ModuleError {
  constructor(code: string) {
    super(
      "cdkey.universal_code_conflict",
      409,
      `universal code already in use: ${code}`,
    );
    this.name = "CdkeyUniversalCodeConflict";
  }
}

export class CdkeyInvalidInput extends ModuleError {
  constructor(message: string) {
    super("cdkey.invalid_input", 400, message);
    this.name = "CdkeyInvalidInput";
  }
}

export class CdkeyGenerateCountExceeded extends ModuleError {
  constructor(max: number) {
    super(
      "cdkey.generate_count_exceeded",
      400,
      `cdkey generate count exceeds the max of ${max} per request`,
    );
    this.name = "CdkeyGenerateCountExceeded";
  }
}
