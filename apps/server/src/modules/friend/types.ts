import type {
  friendSettings,
  friendRelationships,
  friendRequests,
  friendBlocks,
} from "../../schema/friend";

export const FRIEND_REQUEST_STATUSES = ["pending", "accepted", "rejected", "cancelled"] as const;
export type FriendRequestStatus = (typeof FRIEND_REQUEST_STATUSES)[number];

export type FriendSettings = typeof friendSettings.$inferSelect;
export type FriendRelationship = typeof friendRelationships.$inferSelect;
export type FriendRequest = typeof friendRequests.$inferSelect;
export type FriendBlock = typeof friendBlocks.$inferSelect;
