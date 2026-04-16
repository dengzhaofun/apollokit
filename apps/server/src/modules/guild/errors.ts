/**
 * Typed errors for the guild module.
 *
 * Service methods throw these instead of returning `{ error }` objects or
 * raising plain `Error`s. The HTTP layer (routes.ts) maps `ModuleError`
 * instances onto JSON responses via `respondError()`.
 */
export { ModuleError } from "../../lib/errors";
import { ModuleError } from "../../lib/errors";

export class GuildSettingsNotFound extends ModuleError {
  constructor(orgId: string) {
    super("guild.settings_not_found", 404, `guild settings not found for org: ${orgId}`);
    this.name = "GuildSettingsNotFound";
  }
}

export class GuildNotFound extends ModuleError {
  constructor(id: string) {
    super("guild.not_found", 404, `guild not found: ${id}`);
    this.name = "GuildNotFound";
  }
}

export class GuildAlreadyMember extends ModuleError {
  constructor(endUserId: string) {
    super("guild.already_member", 409, `user is already a member of this guild: ${endUserId}`);
    this.name = "GuildAlreadyMember";
  }
}

export class GuildNotMember extends ModuleError {
  constructor(endUserId: string) {
    super("guild.not_member", 404, `user is not a member of this guild: ${endUserId}`);
    this.name = "GuildNotMember";
  }
}

export class GuildMemberLimitReached extends ModuleError {
  constructor(guildId: string) {
    super("guild.member_limit_reached", 409, `guild has reached its member limit: ${guildId}`);
    this.name = "GuildMemberLimitReached";
  }
}

export class GuildOfficerLimitReached extends ModuleError {
  constructor(guildId: string) {
    super("guild.officer_limit_reached", 409, `guild has reached its officer limit: ${guildId}`);
    this.name = "GuildOfficerLimitReached";
  }
}

export class GuildInsufficientPermission extends ModuleError {
  constructor(action: string) {
    super("guild.insufficient_permission", 403, `insufficient permission: ${action}`);
    this.name = "GuildInsufficientPermission";
  }
}

export class GuildAlreadyInGuild extends ModuleError {
  constructor(endUserId: string) {
    super("guild.already_in_guild", 409, `user already belongs to a guild in this org: ${endUserId}`);
    this.name = "GuildAlreadyInGuild";
  }
}

export class GuildJoinRequestNotFound extends ModuleError {
  constructor(id: string) {
    super("guild.join_request_not_found", 404, `join request not found: ${id}`);
    this.name = "GuildJoinRequestNotFound";
  }
}

export class GuildConcurrencyConflict extends ModuleError {
  constructor() {
    super("guild.concurrency_conflict", 409, "guild was modified by another request, please retry");
    this.name = "GuildConcurrencyConflict";
  }
}

export class GuildInactive extends ModuleError {
  constructor(id: string) {
    super("guild.inactive", 409, `guild is disbanded/inactive: ${id}`);
    this.name = "GuildInactive";
  }
}
