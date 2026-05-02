import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { fractionalSortKey } from "./_fractional-sort";

import type { RewardEntry } from "../lib/rewards";
import { organization } from "./auth";
import { collectionAlbums } from "./collection";
import { mediaAssets } from "./media-library";

/**
 * Offline check-in (线下打卡) module — geo + verification check-ins for
 * physical events: comic conventions, designer-toy expos, brand pop-ups,
 * mall scavenger hunts, walking tours.
 *
 * This module is INTENTIONALLY independent from `check-in` (the daily-cycle
 * streak module). The two share zero schema:
 *   - check-in: "calendar dimension" — resetMode + cycleKey + dayNumber
 *   - offline-check-in: "geo dimension" — campaign + spot + verification
 * Forcing them into one table would pollute both fieldsets.
 *
 * For the "stamp card" experience (collect N stamps → unlock reward), we
 * deliberately DO NOT redo what `collection` already does. Instead:
 *   - `offline_check_in_campaigns.collection_album_id` (nullable) attaches
 *     a campaign to a `collection_albums` row.
 *   - `offline_check_in_spots.spot_rewards` includes an `{ type: "item" }`
 *     entry; granting that item drives `collection.onItemGranted` which
 *     auto-unlocks the matching `collection_entries.triggerItemDefinitionId`
 *     and fires `collection_milestones` rewards.
 *   - This module knows nothing about stamp progress beyond what spots
 *     have been completed; "card progress" lives entirely in
 *     `collection_user_entries` / `collection_user_milestones`.
 *
 * Therefore there is NO `milestone_tiers` column, NO `milestones_achieved`
 * jsonb on the user-progress row, and grants for stamp/album milestones
 * are NOT replicated in this module's idempotency ledger — `collection`
 * owns that responsibility.
 *
 * 5 tables:
 *   offline_check_in_campaigns      — campaign / event with mode + completion rule
 *   offline_check_in_spots          — physical checkpoints (lat/lng + verification)
 *   offline_check_in_logs           — per-attempt detail (audit / heatmap source)
 *   offline_check_in_user_progress  — per-(campaign, endUser) aggregate state
 *   offline_check_in_grants         — idempotency ledger for spot/completion rewards
 */

// ─── Domain enums (also re-exported from types.ts as TS unions) ──

export const OFFLINE_CHECK_IN_MODES = ["collect", "daily"] as const;
export type OfflineCheckInMode = (typeof OFFLINE_CHECK_IN_MODES)[number];

export const OFFLINE_CHECK_IN_STATUSES = [
  "draft",
  "published",
  "active",
  "ended",
] as const;
export type OfflineCheckInStatus = (typeof OFFLINE_CHECK_IN_STATUSES)[number];

/**
 * Completion rule discriminated union — `kind` selects the predicate that
 * `service.evaluateCompletion(progress, spotsCount)` runs after each spot
 * check-in.
 *
 *   - `{ kind: "all" }`                       — every spot in the campaign
 *   - `{ kind: "n_of_m", n: number }`         — any N of M spots
 *   - `{ kind: "daily_total", days: number }` — only meaningful for `mode='daily'`
 */
export type OfflineCheckInCompletionRule =
  | { kind: "all" }
  | { kind: "n_of_m"; n: number }
  | { kind: "daily_total"; days: number };

/**
 * Verification declaration on a spot. `methods` lists the supported
 * verification kinds; `combinator` decides whether all of them must pass
 * (`"all"`, e.g. GPS + QR + photo) or just one (`"any"`, e.g. GPS OR
 * staff-code).
 *
 * Adding a new verification kind requires adding the union member here +
 * a case in `verifiers/index.ts dispatchVerify(...)`.
 */
export type OfflineCheckInVerificationMethod =
  | { kind: "gps"; radiusM: number }
  | { kind: "qr"; mode: "static" | "one_time" }
  | { kind: "manual_code"; staffOnly?: boolean }
  | { kind: "photo"; required?: boolean };

export type OfflineCheckInVerification = {
  methods: OfflineCheckInVerificationMethod[];
  combinator: "any" | "all";
};

// ─── Tables ──────────────────────────────────────────────────────

/**
 * Campaign — a single offline check-in activity (con, hunt, brand event).
 *
 * `alias` is an optional human-readable key, unique within the org via a
 * partial unique index — NULL aliases don't conflict with each other.
 *
 * `mode` selects the progression flavor:
 *   - 'collect' — unordered N-of-M stamp rally
 *   - 'daily'   — multi-day attendance, one spot can give credit per day
 *
 * `completion_rule` (jsonb) is the discriminated union above. Validated
 * by the service layer against `mode` (not Postgres CHECK constraints).
 *
 * `collection_album_id` (nullable) attaches the campaign to a
 * `collection_albums` row — the "stamp card" view. The actual unlock
 * pipeline runs through `collection.onItemGranted` driven by spot
 * rewards; this column is purely a UI-layer link so admin can render
 * a single "scan + cards" page.
 *
 * `activity_node_id` is a soft reference to `activity_nodes.id` for
 * v3+ deep-integration with the activity module. No FK constraint —
 * the activity service handles cleanup via `activity_configs.cleanup_rule`.
 */
export const offlineCheckInCampaigns = pgTable(
  "offline_check_in_campaigns",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    alias: text("alias"),
    name: text("name").notNull(),
    description: text("description"),
    bannerImage: text("banner_image"),
    mode: text("mode").notNull(),
    completionRule: jsonb("completion_rule")
      .$type<OfflineCheckInCompletionRule>()
      .notNull(),
    completionRewards: jsonb("completion_rewards")
      .$type<RewardEntry[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    startAt: timestamp("start_at"),
    endAt: timestamp("end_at"),
    timezone: text("timezone").default("UTC").notNull(),
    status: text("status").default("draft").notNull(),
    collectionAlbumId: uuid("collection_album_id").references(
      () => collectionAlbums.id,
      { onDelete: "set null" },
    ),
    /**
     * Soft link to `activity_nodes.id`. NULL = standalone campaign.
     * Same convention as `check_in_configs.activityNodeId`.
     */
    activityNodeId: uuid("activity_node_id"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("offline_check_in_campaigns_org_status_start_idx").on(
      table.organizationId,
      table.status,
      table.startAt,
    ),
    uniqueIndex("offline_check_in_campaigns_org_alias_uidx")
      .on(table.organizationId, table.alias)
      .where(sql`${table.alias} IS NOT NULL`),
    index("offline_check_in_campaigns_album_idx").on(table.collectionAlbumId),
  ],
);

/**
 * Spot — a physical checkpoint within a campaign.
 *
 * Geo:
 *   - `latitude` / `longitude` — WGS84 decimal degrees.
 *   - `geofence_radius_m` — server-side Haversine validation tolerance.
 *
 * Verification:
 *   - `verification` jsonb describes which methods can / must pass.
 *   - Combined with the `combinator` field, supports "GPS OR staff" as
 *     well as "GPS AND QR AND photo".
 *
 * Stamp card link:
 *   - `collection_entry_aliases` is a hint for the UI (which cards this
 *     spot will unlock); the actual unlock runs through item grants.
 *   - `spot_rewards` is the canonical reward; if it includes an item that
 *     `collection_entries.triggerItemDefinitionId` matches, the entry
 *     auto-unlocks via `collection.onItemGranted`.
 */
export const offlineCheckInSpots = pgTable(
  "offline_check_in_spots",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => offlineCheckInCampaigns.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").notNull(),
    alias: text("alias").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    coverImage: text("cover_image"),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    geofenceRadiusM: integer("geofence_radius_m").default(100).notNull(),
    verification: jsonb("verification")
      .$type<OfflineCheckInVerification>()
      .notNull(),
    spotRewards: jsonb("spot_rewards")
      .$type<RewardEntry[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    collectionEntryAliases: jsonb("collection_entry_aliases")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    sortOrder: fractionalSortKey("sort_order").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("offline_check_in_spots_campaign_sort_idx").on(
      table.campaignId,
      table.sortOrder,
    ),
    index("offline_check_in_spots_org_idx").on(table.organizationId),
    uniqueIndex("offline_check_in_spots_campaign_alias_uidx").on(
      table.campaignId,
      table.alias,
    ),
  ],
);

/**
 * Per-attempt log — one row per check-in attempt (success OR failure).
 *
 * Failures are recorded so anti-fraud / rate-limit / heatmap analytics
 * have ground truth. The `accepted` boolean + `reject_reason` distinguish
 * the two.
 *
 * `verified_via` records the actual list of verification methods that
 * passed — a subset of the spot's declared `verification.methods`.
 *
 * Per the project rule, per-action event history WILL move to the unified
 * behavior-log subsystem when it lands. For now this table is the
 * source of truth for audit and heatmap queries; service emits a parallel
 * Tinybird event for analytics.
 *
 * Intentionally NO unique constraint on (spot_id, end_user_id, day):
 *   - 'daily' mode allows the same spot to be checked in multiple days.
 *   - 'collect' mode's anti-double-spot guard runs in the user_progress
 *     `spots_completed` array via lock-free contains-check.
 */
export const offlineCheckInLogs = pgTable(
  "offline_check_in_logs",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => offlineCheckInCampaigns.id, { onDelete: "cascade" }),
    spotId: uuid("spot_id")
      .notNull()
      .references(() => offlineCheckInSpots.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").notNull(),
    endUserId: text("end_user_id").notNull(),
    accepted: boolean("accepted").notNull(),
    rejectReason: text("reject_reason"),
    verifiedVia: jsonb("verified_via").$type<string[]>().notNull(),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    accuracyM: doublePrecision("accuracy_m"),
    distanceM: doublePrecision("distance_m"),
    mediaAssetId: uuid("media_asset_id").references(() => mediaAssets.id, {
      onDelete: "set null",
    }),
    deviceFingerprint: text("device_fingerprint"),
    ip: text("ip"),
    country: text("country"),
    userAgent: text("user_agent"),
    /**
     * Optional one-time-token nonce captured for replay-detection
     * forensics. Not unique here (the KV layer is the actual gate);
     * stored only so an after-the-fact audit can reconstruct what
     * was presented.
     */
    nonce: text("nonce"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("offline_check_in_logs_campaign_user_created_idx").on(
      table.campaignId,
      table.endUserId,
      table.createdAt,
    ),
    index("offline_check_in_logs_spot_created_idx").on(
      table.spotId,
      table.createdAt,
    ),
    index("offline_check_in_logs_org_created_idx").on(
      table.organizationId,
      table.createdAt,
    ),
  ],
);

/**
 * Per-(campaign, endUser) aggregate progress.
 *
 * One row per participant. Tracks ONLY this module's responsibility:
 *   - which spots have been completed (`spots_completed`)
 *   - daily-mode running counts (`daily_count`, `daily_dates`)
 *   - whole-campaign completion timestamp (`completed_at`)
 *
 * "How many cards collected", "which milestones claimed" — those are
 * NOT here. They live in `collection_user_entries` /
 * `collection_user_milestones`. Duplicating them would risk drift.
 *
 * Concurrency:
 *   - First check-in to a spot inserts a row OR updates the existing one
 *     with a `WHERE NOT (spots_completed @> [spotAlias])` guard so two
 *     concurrent check-ins to the same spot serialize and the loser is
 *     a no-op idempotent retry.
 *   - The `version` column lets the service detect "row changed since
 *     I read it" and re-fetch / retry cleanly.
 */
export const offlineCheckInUserProgress = pgTable(
  "offline_check_in_user_progress",
  {
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => offlineCheckInCampaigns.id, { onDelete: "cascade" }),
    endUserId: text("end_user_id").notNull(),
    organizationId: text("organization_id").notNull(),
    spotsCompleted: jsonb("spots_completed")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    totalCount: integer("total_count").default(0).notNull(),
    lastSpotId: uuid("last_spot_id"),
    lastCheckInAt: timestamp("last_check_in_at"),
    dailyCount: integer("daily_count").default(0).notNull(),
    dailyDates: jsonb("daily_dates")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    completedAt: timestamp("completed_at"),
    version: integer("version").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.campaignId, table.endUserId],
      name: "offline_check_in_user_progress_pk",
    }),
    index("offline_check_in_user_progress_org_user_idx").on(
      table.organizationId,
      table.endUserId,
    ),
    index("offline_check_in_user_progress_campaign_completed_idx").on(
      table.campaignId,
      table.completedAt,
    ),
  ],
);

/**
 * Idempotency ledger — one row per `(campaign, endUser, reward_key)` ever
 * granted. Identical pattern to `activity_user_rewards`.
 *
 * `reward_key` discriminator:
 *   - `spot:<alias>`   — spot's per-checkpoint reward
 *   - `completion`     — campaign-completion reward
 *
 * NB: stamp-album milestone grants are NOT recorded here — they have
 * their own ledger in `collection_user_milestones`.
 */
export const offlineCheckInGrants = pgTable(
  "offline_check_in_grants",
  {
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => offlineCheckInCampaigns.id, { onDelete: "cascade" }),
    endUserId: text("end_user_id").notNull(),
    rewardKey: text("reward_key").notNull(),
    organizationId: text("organization_id").notNull(),
    rewardItems: jsonb("reward_items").$type<RewardEntry[]>().notNull(),
    grantedAt: timestamp("granted_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.campaignId, table.endUserId, table.rewardKey],
      name: "offline_check_in_grants_pk",
    }),
    index("offline_check_in_grants_org_user_idx").on(
      table.organizationId,
      table.endUserId,
    ),
  ],
);

// ─── Inferred types ──────────────────────────────────────────────

export type OfflineCheckInCampaign =
  typeof offlineCheckInCampaigns.$inferSelect;
export type OfflineCheckInSpot = typeof offlineCheckInSpots.$inferSelect;
export type OfflineCheckInLog = typeof offlineCheckInLogs.$inferSelect;
export type OfflineCheckInUserProgressRow =
  typeof offlineCheckInUserProgress.$inferSelect;
export type OfflineCheckInGrant = typeof offlineCheckInGrants.$inferSelect;
