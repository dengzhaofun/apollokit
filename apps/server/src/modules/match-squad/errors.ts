/**
 * Typed errors for the match-squad module.
 *
 * Service methods throw these instead of returning `{ error }` objects or
 * raising plain `Error`s. The HTTP layer (routes.ts) maps `ModuleError`
 * instances onto JSON responses via `respondError()`.
 */
export { ModuleError } from "../../lib/errors";
import { ModuleError } from "../../lib/errors";

export class MatchSquadConfigNotFound extends ModuleError {
  constructor(key: string) {
    super("match_squad.config_not_found", 404, `match-squad config not found: ${key}`);
    this.name = "MatchSquadConfigNotFound";
  }
}

export class MatchSquadNotFound extends ModuleError {
  constructor(id: string) {
    super("match_squad.not_found", 404, `match-squad not found: ${id}`);
    this.name = "MatchSquadNotFound";
  }
}

export class MatchSquadFull extends ModuleError {
  constructor(squadId: string) {
    super("match_squad.full", 409, `match-squad is full: ${squadId}`);
    this.name = "MatchSquadFull";
  }
}

export class MatchSquadAlreadyMember extends ModuleError {
  constructor(endUserId: string) {
    super(
      "match_squad.already_member",
      409,
      `user already in a squad for this config: ${endUserId}`,
    );
    this.name = "MatchSquadAlreadyMember";
  }
}

export class MatchSquadNotMember extends ModuleError {
  constructor(endUserId: string) {
    super("match_squad.not_member", 403, `user is not a member of this squad: ${endUserId}`);
    this.name = "MatchSquadNotMember";
  }
}

export class MatchSquadNotLeader extends ModuleError {
  constructor(endUserId: string) {
    super("match_squad.not_leader", 403, `user is not the leader of this squad: ${endUserId}`);
    this.name = "MatchSquadNotLeader";
  }
}

export class MatchSquadInvitationNotFound extends ModuleError {
  constructor(id: string) {
    super("match_squad.invitation_not_found", 404, `invitation not found: ${id}`);
    this.name = "MatchSquadInvitationNotFound";
  }
}

export class MatchSquadConcurrencyConflict extends ModuleError {
  constructor() {
    super(
      "match_squad.concurrency_conflict",
      409,
      "concurrent modification detected, please retry",
    );
    this.name = "MatchSquadConcurrencyConflict";
  }
}

export class MatchSquadAlreadyDissolved extends ModuleError {
  constructor(squadId: string) {
    super("match_squad.already_dissolved", 409, `match-squad is already dissolved: ${squadId}`);
    this.name = "MatchSquadAlreadyDissolved";
  }
}

export class MatchSquadConfigAliasConflict extends ModuleError {
  constructor(alias: string) {
    super(
      "match_squad.alias_conflict",
      409,
      `match-squad config alias already in use in this project: ${alias}`,
    );
    this.name = "MatchSquadConfigAliasConflict";
  }
}
