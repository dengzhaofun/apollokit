import { ModuleError } from "../../lib/errors"

export class TeamMemberNotFound extends ModuleError {
  constructor(id: string) {
    super("team_member.not_found", 404, `Team member ${id} not found`)
  }
}

export class TeamNotInActiveOrg extends ModuleError {
  constructor() {
    super(
      "team_member.team_not_in_org",
      403,
      "Team does not belong to the active organization",
    )
  }
}

export class TargetUserNotInOrg extends ModuleError {
  constructor() {
    super(
      "team_member.user_not_in_org",
      400,
      "Target user is not a member of this organization",
    )
  }
}

export class DuplicateTeamMember extends ModuleError {
  constructor() {
    super(
      "team_member.already_exists",
      409,
      "User is already a member of this team",
    )
  }
}
