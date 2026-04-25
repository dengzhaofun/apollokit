export { ModuleError } from "../../lib/errors";
import { ModuleError } from "../../lib/errors";

export class FriendSettingsNotFound extends ModuleError {
  constructor() {
    super("friend.settings_not_found", 404, "friend settings not configured for this project");
    this.name = "FriendSettingsNotFound";
  }
}

export class FriendLimitReached extends ModuleError {
  constructor() {
    super("friend.limit_reached", 409, "maximum friend limit reached");
    this.name = "FriendLimitReached";
  }
}

export class FriendBlockLimitReached extends ModuleError {
  constructor() {
    super("friend.block_limit_reached", 409, "maximum block limit reached");
    this.name = "FriendBlockLimitReached";
  }
}

export class FriendPendingLimitReached extends ModuleError {
  constructor() {
    super("friend.pending_limit_reached", 409, "maximum pending request limit reached");
    this.name = "FriendPendingLimitReached";
  }
}

export class FriendRequestNotFound extends ModuleError {
  constructor(id: string) {
    super("friend.request_not_found", 404, `friend request not found: ${id}`);
    this.name = "FriendRequestNotFound";
  }
}

export class FriendRequestAlreadyExists extends ModuleError {
  constructor() {
    super("friend.request_already_exists", 409, "a pending friend request already exists between these users");
    this.name = "FriendRequestAlreadyExists";
  }
}

export class FriendAlreadyExists extends ModuleError {
  constructor() {
    super("friend.already_exists", 409, "these users are already friends");
    this.name = "FriendAlreadyExists";
  }
}

export class FriendNotFound extends ModuleError {
  constructor(id: string) {
    super("friend.not_found", 404, `friendship not found: ${id}`);
    this.name = "FriendNotFound";
  }
}

export class FriendBlockedUser extends ModuleError {
  constructor() {
    super("friend.blocked_user", 409, "cannot send friend request to a blocked user or a user who blocked you");
    this.name = "FriendBlockedUser";
  }
}

export class FriendSelfAction extends ModuleError {
  constructor() {
    super("friend.self_action", 400, "cannot perform friend actions with yourself");
    this.name = "FriendSelfAction";
  }
}

export class FriendConcurrencyConflict extends ModuleError {
  constructor() {
    super("friend.concurrency_conflict", 409, "concurrent modification detected, please retry");
    this.name = "FriendConcurrencyConflict";
  }
}
