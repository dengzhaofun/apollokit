import type { mailMessages, mailUserStates } from "../../schema/mail";
import type { ItemEntry } from "../item/types";

export type MailMessage = typeof mailMessages.$inferSelect;
export type MailUserState = typeof mailUserStates.$inferSelect;

export const MAIL_TARGET_TYPES = ["broadcast", "multicast"] as const;
export type MailTargetType = (typeof MAIL_TARGET_TYPES)[number];

/** Hard upper bound for a single multicast recipient list (enforced in validators). */
export const MAIL_MULTICAST_MAX = 5000;

/**
 * Message as shown in a user's inbox: the message payload plus that user's
 * read/claim state (null fields if no row exists in `mail_user_states`).
 */
export type InboxMessage = {
  id: string;
  title: string;
  content: string;
  rewards: ItemEntry[];
  requireRead: boolean;
  sentAt: Date;
  expiresAt: Date | null;
  readAt: Date | null;
  claimedAt: Date | null;
};

/**
 * Admin detail view: full message plus aggregate stats.
 *
 * `targetCount` is the denominator for engagement — for multicast it's the
 * length of `targetUserIds`; for broadcast it's null (unknown, since
 * endUserId has no registration table).
 */
export type MailMessageWithStats = MailMessage & {
  readCount: number;
  claimCount: number;
  targetCount: number | null;
};

export type ClaimResult = {
  messageId: string;
  endUserId: string;
  rewards: ItemEntry[];
  claimedAt: Date;
  readAt: Date | null;
};
