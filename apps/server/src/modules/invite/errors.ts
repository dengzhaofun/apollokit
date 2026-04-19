import { ModuleError } from "../../lib/errors";

export { ModuleError };

export class InviteDisabled extends ModuleError {
  constructor() {
    super("invite.disabled", 403, "invite system is disabled for this organization");
    this.name = "InviteDisabled";
  }
}

export class InviteCodeNotFound extends ModuleError {
  constructor() {
    super("invite.code_not_found", 404, "invite code not found or has been reset");
    this.name = "InviteCodeNotFound";
  }
}

export class InviteSelfInviteForbidden extends ModuleError {
  constructor() {
    super("invite.self_invite_forbidden", 400, "cannot invite yourself");
    this.name = "InviteSelfInviteForbidden";
  }
}

export class InviteAlreadyBound extends ModuleError {
  constructor() {
    super("invite.already_bound", 409, "this user is already bound to a different inviter");
    this.name = "InviteAlreadyBound";
  }
}

export class InviteeNotBound extends ModuleError {
  constructor() {
    super("invite.invitee_not_bound", 404, "invitee has no bound inviter");
    this.name = "InviteeNotBound";
  }
}

export class InviteRelationshipNotFound extends ModuleError {
  constructor(id: string) {
    super("invite.relationship_not_found", 404, `invite relationship not found: ${id}`);
    this.name = "InviteRelationshipNotFound";
  }
}

export class InviteCodeConflict extends ModuleError {
  constructor() {
    super("invite.code_conflict", 500, "failed to generate a unique invite code after retries");
    this.name = "InviteCodeConflict";
  }
}
