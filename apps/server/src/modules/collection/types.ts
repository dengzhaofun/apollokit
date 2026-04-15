import type {
  collectionAlbums,
  collectionEntries,
  collectionGroups,
  collectionMilestones,
  collectionUserEntries,
  collectionUserMilestones,
} from "../../schema/collection";

/**
 * Drizzle's `$inferSelect` is the authoritative row shape. We re-export
 * it here rather than re-type by hand so schema changes propagate
 * automatically.
 */
export type CollectionAlbum = typeof collectionAlbums.$inferSelect;
export type CollectionGroup = typeof collectionGroups.$inferSelect;
export type CollectionEntry = typeof collectionEntries.$inferSelect;
export type CollectionMilestone = typeof collectionMilestones.$inferSelect;
export type CollectionUserEntry = typeof collectionUserEntries.$inferSelect;
export type CollectionUserMilestone =
  typeof collectionUserMilestones.$inferSelect;

/** Trigger types that drive entry unlocks. 'event' is reserved for
 *  the future behavior-log subsystem and is not yet implemented. */
export const TRIGGER_TYPES = ["item", "event"] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];

/** Milestone scopes — the "granularity" of a reward node. */
export const MILESTONE_SCOPES = ["entry", "group", "album"] as const;
export type MilestoneScope = (typeof MILESTONE_SCOPES)[number];

/** Album scope is a free-form display tag; we lock the MVP set to keep
 *  the admin UI tidy, but storage is plain text — tenants can add their
 *  own via the API if needed. */
export const ALBUM_SCOPES = [
  "hero",
  "monster",
  "equipment",
  "custom",
] as const;
export type AlbumScope = (typeof ALBUM_SCOPES)[number];

/** Milestone delivery path — recorded in collection_user_milestones.deliveryMode
 *  so ops can tell apart "player tapped claim" vs "auto-dispatched via mail". */
export const DELIVERY_MODES = ["manual", "mail"] as const;
export type DeliveryMode = (typeof DELIVERY_MODES)[number];
