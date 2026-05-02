/**
 * Offline-check-in domain types.
 *
 * Read-side row types come from drizzle's `$inferSelect`. Write-side
 * input types are derived from zod schemas in `./validators.ts` so the
 * service and HTTP layers share a single source of truth.
 */

import type { RewardEntry } from "../../lib/rewards";
import type {
  offlineCheckInCampaigns,
  offlineCheckInGrants,
  offlineCheckInLogs,
  offlineCheckInSpots,
  offlineCheckInUserProgress,
  OfflineCheckInCompletionRule,
  OfflineCheckInMode,
  OfflineCheckInStatus,
  OfflineCheckInVerification,
  OfflineCheckInVerificationMethod,
} from "../../schema/offline-check-in";

export {
  OFFLINE_CHECK_IN_MODES,
  OFFLINE_CHECK_IN_STATUSES,
} from "../../schema/offline-check-in";

export type {
  OfflineCheckInCompletionRule,
  OfflineCheckInMode,
  OfflineCheckInStatus,
  OfflineCheckInVerification,
  OfflineCheckInVerificationMethod,
};

export type OfflineCheckInCampaign =
  typeof offlineCheckInCampaigns.$inferSelect;
export type OfflineCheckInSpot = typeof offlineCheckInSpots.$inferSelect;
export type OfflineCheckInLog = typeof offlineCheckInLogs.$inferSelect;
export type OfflineCheckInUserProgressRow =
  typeof offlineCheckInUserProgress.$inferSelect;
export type OfflineCheckInGrant = typeof offlineCheckInGrants.$inferSelect;

/** Verification methods that actually passed for a successful check-in. */
export type VerifiedKind = OfflineCheckInVerificationMethod["kind"];

/** Result of a single check-in attempt. */
export type OfflineCheckInResult = {
  accepted: boolean;
  /** Spot-level reward grants this attempt produced (excludes album milestones — see `collection` for those). */
  granted: RewardEntry[];
  /** Whether the campaign was just completed (completion reward fired this attempt). */
  justCompleted: boolean;
  /** Verification methods that actually passed (subset of spot.verification.methods kinds). */
  verifiedVia: VerifiedKind[];
  progress: OfflineCheckInUserProgressRow;
  /** Distance from the spot in meters, if GPS verification was attempted. */
  distanceM: number | null;
  /**
   * If `accepted=false`, the reason; the typed error class controls the
   * HTTP status — this string is for display.
   */
  rejectReason: string | null;
};
