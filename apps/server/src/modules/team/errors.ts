/**
 * Typed errors for the team module.
 *
 * Service methods throw these instead of returning `{ error }` objects or
 * raising plain `Error`s. The HTTP layer (routes.ts) maps `ModuleError`
 * instances onto JSON responses via `respondError()`.
 */
export { ModuleError } from "../../lib/errors";
import { ModuleError } from "../../lib/errors";

export class TeamConfigNotFound extends ModuleError {
  constructor(key: string) {
    super("team.config_not_found", 404, `team config not found: ${key}`);
    this.name = "TeamConfigNotFound";
  }
}

export class TeamNotFound extends ModuleError {
  constructor(id: string) {
    super("team.not_found", 404, `team not found: ${id}`);
    this.name = "TeamNotFound";
  }
}

export class TeamFull extends ModuleError {
  constructor(teamId: string) {
    super("team.full", 409, `team is full: ${teamId}`);
    this.name = "TeamFull";
  }
}

export class TeamAlreadyInTeam extends ModuleError {
  constructor(endUserId: string) {
    super(
      "team.already_in_team",
      409,
      `user already in a team for this config: ${endUserId}`,
    );
    this.name = "TeamAlreadyInTeam";
  }
}

export class TeamNotMember extends ModuleError {
  constructor(endUserId: string) {
    super("team.not_member", 403, `user is not a member of this team: ${endUserId}`);
    this.name = "TeamNotMember";
  }
}

export class TeamNotLeader extends ModuleError {
  constructor(endUserId: string) {
    super("team.not_leader", 403, `user is not the leader of this team: ${endUserId}`);
    this.name = "TeamNotLeader";
  }
}

export class TeamInvitationNotFound extends ModuleError {
  constructor(id: string) {
    super("team.invitation_not_found", 404, `invitation not found: ${id}`);
    this.name = "TeamInvitationNotFound";
  }
}

export class TeamConcurrencyConflict extends ModuleError {
  constructor() {
    super(
      "team.concurrency_conflict",
      409,
      "concurrent modification detected, please retry",
    );
    this.name = "TeamConcurrencyConflict";
  }
}

export class TeamAlreadyDissolved extends ModuleError {
  constructor(teamId: string) {
    super("team.already_dissolved", 409, `team is already dissolved: ${teamId}`);
    this.name = "TeamAlreadyDissolved";
  }
}

export class TeamConfigAliasConflict extends ModuleError {
  constructor(alias: string) {
    super(
      "team.alias_conflict",
      409,
      `team config alias already in use in this project: ${alias}`,
    );
    this.name = "TeamConfigAliasConflict";
  }
}
