/**
 * Typed errors for the offline-check-in module.
 *
 * Service methods throw these; the HTTP layer maps them to the standard
 * envelope via the router factory's `onError`.
 */

export { ModuleError } from "../../lib/errors";
import { ModuleError } from "../../lib/errors";

export class OfflineCampaignNotFound extends ModuleError {
  constructor(key: string) {
    super(
      "offline_check_in.campaign_not_found",
      404,
      `offline check-in campaign not found: ${key}`,
    );
    this.name = "OfflineCampaignNotFound";
  }
}

export class OfflineCampaignAliasConflict extends ModuleError {
  constructor(alias: string) {
    super(
      "offline_check_in.campaign_alias_conflict",
      409,
      `offline check-in campaign alias already in use: ${alias}`,
    );
    this.name = "OfflineCampaignAliasConflict";
  }
}

export class OfflineCampaignInactive extends ModuleError {
  constructor(key: string) {
    super(
      "offline_check_in.campaign_inactive",
      409,
      `offline check-in campaign is not active: ${key}`,
    );
    this.name = "OfflineCampaignInactive";
  }
}

export class OfflineSpotNotFound extends ModuleError {
  constructor(key: string) {
    super(
      "offline_check_in.spot_not_found",
      404,
      `offline check-in spot not found: ${key}`,
    );
    this.name = "OfflineSpotNotFound";
  }
}

export class OfflineSpotAliasConflict extends ModuleError {
  constructor(alias: string) {
    super(
      "offline_check_in.spot_alias_conflict",
      409,
      `spot alias already in use within this campaign: ${alias}`,
    );
    this.name = "OfflineSpotAliasConflict";
  }
}

export class OfflineSpotInactive extends ModuleError {
  constructor(key: string) {
    super(
      "offline_check_in.spot_inactive",
      409,
      `spot is inactive: ${key}`,
    );
    this.name = "OfflineSpotInactive";
  }
}

export class OfflineInvalidInput extends ModuleError {
  constructor(message: string) {
    super("offline_check_in.invalid_input", 400, message);
    this.name = "OfflineInvalidInput";
  }
}

/**
 * Thrown when the requested verification method failed (GPS out of range,
 * QR token already consumed, etc). HTTP 400 because the client supplied
 * insufficient or wrong proof — they can re-attempt with the right input.
 */
export class OfflineVerificationFailed extends ModuleError {
  constructor(message: string) {
    super("offline_check_in.verification_failed", 400, message);
    this.name = "OfflineVerificationFailed";
  }
}
