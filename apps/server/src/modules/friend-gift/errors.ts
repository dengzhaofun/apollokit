export { ModuleError } from "../../lib/errors";
import { ModuleError } from "../../lib/errors";

export class FriendGiftSettingsNotFound extends ModuleError {
  constructor() {
    super(
      "friend_gift.settings_not_found",
      404,
      "friend gift settings not configured for this organization",
    );
    this.name = "FriendGiftSettingsNotFound";
  }
}

export class FriendGiftPackageNotFound extends ModuleError {
  constructor(id: string) {
    super(
      "friend_gift.package_not_found",
      404,
      `friend gift package not found: ${id}`,
    );
    this.name = "FriendGiftPackageNotFound";
  }
}

export class FriendGiftNotFound extends ModuleError {
  constructor(id: string) {
    super("friend_gift.not_found", 404, `friend gift send not found: ${id}`);
    this.name = "FriendGiftNotFound";
  }
}

export class FriendGiftNotFriends extends ModuleError {
  constructor() {
    super(
      "friend_gift.not_friends",
      409,
      "sender and receiver are not friends",
    );
    this.name = "FriendGiftNotFriends";
  }
}

export class FriendGiftDailySendLimitReached extends ModuleError {
  constructor() {
    super(
      "friend_gift.daily_send_limit_reached",
      409,
      "daily send limit reached",
    );
    this.name = "FriendGiftDailySendLimitReached";
  }
}

export class FriendGiftDailyReceiveLimitReached extends ModuleError {
  constructor() {
    super(
      "friend_gift.daily_receive_limit_reached",
      409,
      "daily receive limit reached for receiver",
    );
    this.name = "FriendGiftDailyReceiveLimitReached";
  }
}

export class FriendGiftAlreadyClaimed extends ModuleError {
  constructor(id: string) {
    super(
      "friend_gift.already_claimed",
      409,
      `gift has already been claimed: ${id}`,
    );
    this.name = "FriendGiftAlreadyClaimed";
  }
}

export class FriendGiftExpired extends ModuleError {
  constructor(id: string) {
    super("friend_gift.expired", 409, `gift has expired: ${id}`);
    this.name = "FriendGiftExpired";
  }
}

export class FriendGiftConcurrencyConflict extends ModuleError {
  constructor() {
    super(
      "friend_gift.concurrency_conflict",
      409,
      "concurrent modification detected, please retry",
    );
    this.name = "FriendGiftConcurrencyConflict";
  }
}

export class FriendGiftPackageInactive extends ModuleError {
  constructor(id: string) {
    super(
      "friend_gift.package_inactive",
      409,
      `friend gift package is inactive: ${id}`,
    );
    this.name = "FriendGiftPackageInactive";
  }
}

export class FriendGiftPackageAliasConflict extends ModuleError {
  constructor(alias: string) {
    super(
      "friend_gift.package_alias_conflict",
      409,
      `friend gift package alias already in use in this organization: ${alias}`,
    );
    this.name = "FriendGiftPackageAliasConflict";
  }
}

export class FriendGiftBlockedUser extends ModuleError {
  constructor() {
    super(
      "friend_gift.blocked_user",
      409,
      "cannot send gift to a blocked user or a user who blocked you",
    );
    this.name = "FriendGiftBlockedUser";
  }
}
