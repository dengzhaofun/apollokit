import type {
  matchSquadConfigs,
  matchSquadInvitations,
  matchSquadMembers,
  matchSquads,
} from "../../schema/match-squad";

export const MATCH_SQUAD_STATUSES = ["open", "closed", "in_game", "dissolved"] as const;
export type TeamStatus = (typeof MATCH_SQUAD_STATUSES)[number];

export const MEMBER_ROLES = ["leader", "member"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const INVITATION_STATUSES = ["pending", "accepted", "rejected", "expired"] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

/**
 * Drizzle `$inferSelect` re-exports — the authoritative TypeScript shape
 * for what comes out of the database.
 */
export type TeamConfig = typeof matchSquadConfigs.$inferSelect;
export type MatchSquad = typeof matchSquads.$inferSelect;
export type TeamMember = typeof matchSquadMembers.$inferSelect;
export type TeamInvitation = typeof matchSquadInvitations.$inferSelect;

export type MatchSquadWithMembers = MatchSquad & {
  members: TeamMember[];
};
