/**
 * Team-members module barrel.
 */
import { deps } from "../../deps"
import { createTeamMemberService } from "./service"

export { createTeamMemberService }
export type { TeamMemberService } from "./service"
export const teamMemberService = createTeamMemberService(deps)
export { teamMemberRouter } from "./routes"
