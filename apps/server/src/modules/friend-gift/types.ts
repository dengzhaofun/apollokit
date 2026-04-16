import type {
  friendGiftSettings,
  friendGiftPackages,
  friendGiftSends,
  friendGiftDailyStates,
} from "../../schema/friend-gift";

export const GIFT_SEND_STATUSES = [
  "pending",
  "claimed",
  "expired",
  "cancelled",
] as const;
export type GiftSendStatus = (typeof GIFT_SEND_STATUSES)[number];

export type FriendGiftSettings = typeof friendGiftSettings.$inferSelect;
export type FriendGiftPackage = typeof friendGiftPackages.$inferSelect;
export type FriendGiftSend = typeof friendGiftSends.$inferSelect;
export type FriendGiftDailyState = typeof friendGiftDailyStates.$inferSelect;
