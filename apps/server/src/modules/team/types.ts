import type {
  teamConfigs,
  teamInvitations,
  teamMembers,
  teamTeams,
} from "../../schema/team";

export const TEAM_STATUSES = ["open", "closed", "in_game", "dissolved"] as const;
export type TeamStatus = (typeof TEAM_STATUSES)[number];

export const MEMBER_ROLES = ["leader", "member"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const INVITATION_STATUSES = ["pending", "accepted", "rejected", "expired"] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

/**
 * Drizzle `$inferSelect` re-exports — the authoritative TypeScript shape
 * for what comes out of the database.
 */
export type TeamConfig = typeof teamConfigs.$inferSelect;
export type Team = typeof teamTeams.$inferSelect;
export type TeamMember = typeof teamMembers.$inferSelect;
export type TeamInvitation = typeof teamInvitations.$inferSelect;

export type TeamWithMembers = Team & {
  members: TeamMember[];
};
