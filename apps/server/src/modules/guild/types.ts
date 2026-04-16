import type {
  guildContributionLogs,
  guildGuilds,
  guildJoinRequests,
  guildMembers,
  guildSettings,
} from "../../schema/guild";

export const GUILD_ROLES = ["leader", "officer", "member"] as const;
export type GuildRole = (typeof GUILD_ROLES)[number];

export const JOIN_MODES = ["open", "request", "closed"] as const;
export type JoinMode = (typeof JOIN_MODES)[number];

export const REQUEST_TYPES = ["application", "invitation"] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

export const REQUEST_STATUSES = ["pending", "accepted", "rejected", "cancelled"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export type GuildSettings = typeof guildSettings.$inferSelect;
export type Guild = typeof guildGuilds.$inferSelect;
export type GuildMember = typeof guildMembers.$inferSelect;
export type GuildJoinRequest = typeof guildJoinRequests.$inferSelect;
export type GuildContributionLog = typeof guildContributionLogs.$inferSelect;
