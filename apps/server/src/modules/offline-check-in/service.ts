/**
 * Offline-check-in service — protocol-agnostic business logic.
 *
 * MUST NOT import Hono / @hono/zod-openapi / db / deps. Only `AppDeps`
 * type + RewardServices + a `NonceStore` interface come in via the
 * factory.
 *
 * ---------------------------------------------------------------------
 * Reward delivery and the collection coupling
 * ---------------------------------------------------------------------
 *
 * Three reward layers exist for a check-in:
 *
 *   1. **Spot rewards** (`offline_check_in_spots.spot_rewards`) — granted
 *      synchronously inside `checkIn` via `grantRewards`. Idempotency is
 *      `offline_check_in_grants(rewardKey="spot:<alias>")` row presence.
 *
 *   2. **Stamp-album entry / milestone rewards** — NOT granted by us.
 *      A spot reward that includes `{ type:"item", id: <itemDefinitionId> }`
 *      where the item maps to `collection_entries.triggerItemDefinitionId`
 *      flows through `collection.onItemGranted` → entry unlock →
 *      milestone evaluation. We never call `collectionService` here.
 *
 *   3. **Completion reward** (`offline_check_in_campaigns.completion_rewards`)
 *      — granted on the same call that flips `progress.completed_at`.
 *      Idempotency is `offline_check_in_grants(rewardKey="completion")`.
 *
 * ---------------------------------------------------------------------
 * Concurrency on `offline_check_in_user_progress`
 * ---------------------------------------------------------------------
 *
 * Two concurrent check-ins to the same spot for the same end user race on
 * the per-(campaign, endUser) row. The atomic write is:
 *
 *   INSERT INTO offline_check_in_user_progress (...)
 *   VALUES (...with the new spot appended...)
 *   ON CONFLICT (campaign_id, end_user_id) DO UPDATE
 *     SET spots_completed = ...
 *   WHERE NOT (offline_check_in_user_progress.spots_completed @> '["<spot>"]'::jsonb)
 *   RETURNING ..., (xmax = 0) AS inserted;
 *
 * Loser of the race sees zero rows returned and short-circuits to
 * "already-checked-in for this spot" without granting again. The
 * `offline_check_in_grants` PK is the second idempotency layer that
 * makes spot reward delivery ON CONFLICT DO NOTHING.
 *
 * For `daily` mode the dedup is on (`spotAlias` for that day's date).
 * We compose the spot identifier as `<alias>@<dateKey>` for `daily`,
 * leaving the contains-guard semantics intact.
 */

import {
  and,
  asc,
  desc,
  eq,
  ilike,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import type { AppDeps } from "../../deps";
import { isUniqueViolation } from "../../lib/db-errors";
import { appendKey } from "../../lib/fractional-order";
import { looksLikeId } from "../../lib/key-resolver";
import { logger } from "../../lib/logger";
import {
  buildPage,
  buildPageBy,
  clampLimit,
  cursorWhere,
  type Page,
  type PageParams,
} from "../../lib/pagination";
import { grantRewards, type RewardEntry, type RewardServices } from "../../lib/rewards";
import {
  offlineCheckInCampaigns,
  offlineCheckInGrants,
  offlineCheckInLogs,
  offlineCheckInSpots,
  offlineCheckInUserProgress,
  type OfflineCheckInCompletionRule,
} from "../../schema/offline-check-in";
import {
  OfflineCampaignAliasConflict,
  OfflineCampaignInactive,
  OfflineCampaignNotFound,
  OfflineInvalidInput,
  OfflineSpotAliasConflict,
  OfflineSpotInactive,
  OfflineSpotNotFound,
  OfflineVerificationFailed,
} from "./errors";
import { isValidLatLng } from "./geo";
import type { NonceStore } from "./nonce-store";
import type {
  OfflineCheckInCampaign,
  OfflineCheckInLog,
  OfflineCheckInMode,
  OfflineCheckInResult,
  OfflineCheckInSpot,
  OfflineCheckInUserProgressRow,
  VerifiedKind,
} from "./types";
import {
  OFFLINE_CHECK_IN_MODES,
  OFFLINE_CHECK_IN_STATUSES,
} from "./types";
import { verify, type VerifyInput } from "./verifiers";
import type {
  CreateCampaignInput,
  CreateSpotInput,
  UpdateCampaignInput,
  UpdateSpotInput,
} from "./validators";

type OfflineCheckInDeps = Pick<AppDeps, "db"> & Partial<Pick<AppDeps, "events">>;

// Extend the in-runtime event-bus type map with offline-check-in events.
declare module "../../lib/event-bus" {
  interface EventMap {
    "offline_check_in.attempted": {
      organizationId: string;
      endUserId: string;
      campaignId: string;
      spotId: string;
      accepted: boolean;
      rejectReason: string | null;
      verifiedVia: VerifiedKind[];
      lat: number | null;
      lng: number | null;
      accuracyM: number | null;
      distanceM: number | null;
      country: string | null;
    };
    "offline_check_in.completed": {
      organizationId: string;
      endUserId: string;
      campaignId: string;
      spotId: string;
      lat: number | null;
      lng: number | null;
      distanceM: number | null;
    };
    "offline_check_in.campaign_completed": {
      organizationId: string;
      endUserId: string;
      campaignId: string;
      totalCount: number;
    };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────

function assertMode(mode: string): asserts mode is OfflineCheckInMode {
  if (!(OFFLINE_CHECK_IN_MODES as readonly string[]).includes(mode)) {
    throw new OfflineInvalidInput(`invalid mode: ${mode}`);
  }
}

function naturalDateKey(now: Date, timezone: string): string {
  // Same approach as check-in/time.ts — produce YYYY-MM-DD in the
  // given IANA timezone. Inlined here so the offline module stays
  // self-contained.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (!year || !month || !day) {
    throw new OfflineInvalidInput(`invalid timezone: ${timezone}`);
  }
  return `${year}-${month}-${day}`;
}

/**
 * The marker that goes into `progress.spots_completed`. For 'collect' mode
 * we use the spot alias directly; for 'daily' mode we suffix the natural
 * date so the same spot can be checked in across multiple days but at
 * most once per day.
 */
function progressMarker(
  mode: OfflineCheckInMode,
  spotAlias: string,
  dateKey: string,
): string {
  return mode === "daily" ? `${spotAlias}@${dateKey}` : spotAlias;
}

function evaluateCompletion(
  rule: OfflineCheckInCompletionRule,
  spotsTotal: number,
  progress: {
    totalCount: number;
    dailyCount: number;
    spotsCompleted: string[];
  },
): boolean {
  switch (rule.kind) {
    case "all":
      return progress.totalCount >= spotsTotal && spotsTotal > 0;
    case "n_of_m":
      return progress.totalCount >= rule.n;
    case "daily_total":
      return progress.dailyCount >= rule.days;
  }
}

// ─── Service factory ─────────────────────────────────────────────

export function createOfflineCheckInService(
  d: OfflineCheckInDeps,
  rewardServices: RewardServices,
  nonceStore: NonceStore,
) {
  const { db, events } = d;

  async function loadCampaignByKey(
    organizationId: string,
    key: string,
  ): Promise<OfflineCheckInCampaign> {
    const where = looksLikeId(key)
      ? and(
          eq(offlineCheckInCampaigns.organizationId, organizationId),
          eq(offlineCheckInCampaigns.id, key),
        )
      : and(
          eq(offlineCheckInCampaigns.organizationId, organizationId),
          eq(offlineCheckInCampaigns.alias, key),
        );
    const rows = await db
      .select()
      .from(offlineCheckInCampaigns)
      .where(where)
      .limit(1);
    const row = rows[0];
    if (!row) throw new OfflineCampaignNotFound(key);
    return row;
  }

  async function loadSpotByAlias(
    campaignId: string,
    alias: string,
  ): Promise<OfflineCheckInSpot> {
    const rows = await db
      .select()
      .from(offlineCheckInSpots)
      .where(
        and(
          eq(offlineCheckInSpots.campaignId, campaignId),
          eq(offlineCheckInSpots.alias, alias),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) throw new OfflineSpotNotFound(alias);
    return row;
  }

  return {
    // ─── Campaign CRUD ────────────────────────────────────────

    async createCampaign(
      organizationId: string,
      input: CreateCampaignInput,
    ): Promise<OfflineCheckInCampaign> {
      assertMode(input.mode);
      try {
        const [row] = await db
          .insert(offlineCheckInCampaigns)
          .values({
            organizationId,
            name: input.name,
            alias: input.alias ?? null,
            description: input.description ?? null,
            bannerImage: input.bannerImage ?? null,
            mode: input.mode,
            completionRule: input.completionRule,
            completionRewards: input.completionRewards ?? [],
            startAt: input.startAt ? new Date(input.startAt) : null,
            endAt: input.endAt ? new Date(input.endAt) : null,
            timezone: input.timezone ?? "UTC",
            status: "draft",
            collectionAlbumId: input.collectionAlbumId ?? null,
            activityNodeId: input.activityNodeId ?? null,
            metadata: input.metadata ?? null,
          })
          .returning();
        if (!row) throw new Error("insert returned no row");
        return row;
      } catch (err) {
        if (isUniqueViolation(err) && input.alias) {
          throw new OfflineCampaignAliasConflict(input.alias);
        }
        throw err;
      }
    },

    async updateCampaign(
      organizationId: string,
      id: string,
      patch: UpdateCampaignInput,
    ): Promise<OfflineCheckInCampaign> {
      const existing = await loadCampaignByKey(organizationId, id);

      const updateValues: Partial<typeof offlineCheckInCampaigns.$inferInsert> = {};
      if (patch.name !== undefined) updateValues.name = patch.name;
      if (patch.alias !== undefined) updateValues.alias = patch.alias;
      if (patch.description !== undefined)
        updateValues.description = patch.description;
      if (patch.bannerImage !== undefined)
        updateValues.bannerImage = patch.bannerImage;
      if (patch.completionRule !== undefined)
        updateValues.completionRule = patch.completionRule;
      if (patch.completionRewards !== undefined)
        updateValues.completionRewards = patch.completionRewards;
      if (patch.startAt !== undefined)
        updateValues.startAt = patch.startAt ? new Date(patch.startAt) : null;
      if (patch.endAt !== undefined)
        updateValues.endAt = patch.endAt ? new Date(patch.endAt) : null;
      if (patch.timezone !== undefined) updateValues.timezone = patch.timezone;
      if (patch.status !== undefined) {
        if (
          !(OFFLINE_CHECK_IN_STATUSES as readonly string[]).includes(patch.status)
        ) {
          throw new OfflineInvalidInput(`invalid status: ${patch.status}`);
        }
        updateValues.status = patch.status;
      }
      if (patch.collectionAlbumId !== undefined)
        updateValues.collectionAlbumId = patch.collectionAlbumId;
      if (patch.activityNodeId !== undefined)
        updateValues.activityNodeId = patch.activityNodeId;
      if (patch.metadata !== undefined) updateValues.metadata = patch.metadata;

      if (Object.keys(updateValues).length === 0) return existing;

      try {
        const [row] = await db
          .update(offlineCheckInCampaigns)
          .set(updateValues)
          .where(
            and(
              eq(offlineCheckInCampaigns.id, existing.id),
              eq(offlineCheckInCampaigns.organizationId, organizationId),
            ),
          )
          .returning();
        if (!row) throw new OfflineCampaignNotFound(id);
        return row;
      } catch (err) {
        if (isUniqueViolation(err) && patch.alias) {
          throw new OfflineCampaignAliasConflict(patch.alias);
        }
        throw err;
      }
    },

    async deleteCampaign(organizationId: string, id: string): Promise<void> {
      const deleted = await db
        .delete(offlineCheckInCampaigns)
        .where(
          and(
            eq(offlineCheckInCampaigns.id, id),
            eq(offlineCheckInCampaigns.organizationId, organizationId),
          ),
        )
        .returning({ id: offlineCheckInCampaigns.id });
      if (deleted.length === 0) throw new OfflineCampaignNotFound(id);
    },

    async getCampaign(
      organizationId: string,
      idOrAlias: string,
    ): Promise<OfflineCheckInCampaign> {
      return loadCampaignByKey(organizationId, idOrAlias);
    },

    async listCampaigns(
      organizationId: string,
      filter: PageParams & { status?: string } = {},
    ): Promise<Page<OfflineCheckInCampaign>> {
      const limit = clampLimit(filter.limit);
      const conds: SQL[] = [
        eq(offlineCheckInCampaigns.organizationId, organizationId),
      ];
      if (filter.status) {
        conds.push(eq(offlineCheckInCampaigns.status, filter.status));
      }
      const seek = cursorWhere(
        filter.cursor,
        offlineCheckInCampaigns.createdAt,
        offlineCheckInCampaigns.id,
      );
      if (seek) conds.push(seek);
      if (filter.q) {
        const pat = `%${filter.q}%`;
        const search = or(
          ilike(offlineCheckInCampaigns.name, pat),
          ilike(offlineCheckInCampaigns.alias, pat),
        );
        if (search) conds.push(search);
      }
      const rows = await db
        .select()
        .from(offlineCheckInCampaigns)
        .where(and(...conds))
        .orderBy(
          desc(offlineCheckInCampaigns.createdAt),
          desc(offlineCheckInCampaigns.id),
        )
        .limit(limit + 1);
      return buildPage(rows, limit);
    },

    // ─── Spot CRUD ────────────────────────────────────────────

    async createSpot(
      organizationId: string,
      campaignKey: string,
      input: CreateSpotInput,
    ): Promise<OfflineCheckInSpot> {
      const campaign = await loadCampaignByKey(organizationId, campaignKey);
      if (!isValidLatLng(input.latitude, input.longitude)) {
        throw new OfflineInvalidInput("invalid latitude/longitude");
      }
      if (input.verification.methods.length === 0) {
        throw new OfflineInvalidInput("verification.methods must not be empty");
      }
      const sortOrder = await appendKey(db, {
        table: offlineCheckInSpots,
        sortColumn: offlineCheckInSpots.sortOrder,
        scopeWhere: eq(offlineCheckInSpots.campaignId, campaign.id),
      });
      try {
        const [row] = await db
          .insert(offlineCheckInSpots)
          .values({
            campaignId: campaign.id,
            organizationId,
            alias: input.alias,
            name: input.name,
            description: input.description ?? null,
            coverImage: input.coverImage ?? null,
            latitude: input.latitude,
            longitude: input.longitude,
            geofenceRadiusM: input.geofenceRadiusM ?? 100,
            verification: input.verification,
            spotRewards: input.spotRewards ?? [],
            collectionEntryAliases: input.collectionEntryAliases ?? [],
            sortOrder,
            isActive: input.isActive ?? true,
            metadata: input.metadata ?? null,
          })
          .returning();
        if (!row) throw new Error("insert returned no row");
        return row;
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new OfflineSpotAliasConflict(input.alias);
        }
        throw err;
      }
    },

    async updateSpot(
      organizationId: string,
      spotId: string,
      patch: UpdateSpotInput,
    ): Promise<OfflineCheckInSpot> {
      const existingRows = await db
        .select()
        .from(offlineCheckInSpots)
        .where(
          and(
            eq(offlineCheckInSpots.id, spotId),
            eq(offlineCheckInSpots.organizationId, organizationId),
          ),
        )
        .limit(1);
      const existing = existingRows[0];
      if (!existing) throw new OfflineSpotNotFound(spotId);

      const updateValues: Partial<typeof offlineCheckInSpots.$inferInsert> = {};
      if (patch.alias !== undefined) updateValues.alias = patch.alias;
      if (patch.name !== undefined) updateValues.name = patch.name;
      if (patch.description !== undefined)
        updateValues.description = patch.description;
      if (patch.coverImage !== undefined)
        updateValues.coverImage = patch.coverImage;
      if (patch.latitude !== undefined) {
        const lng = patch.longitude ?? existing.longitude;
        if (!isValidLatLng(patch.latitude, lng)) {
          throw new OfflineInvalidInput("invalid latitude/longitude");
        }
        updateValues.latitude = patch.latitude;
      }
      if (patch.longitude !== undefined) {
        const lat = patch.latitude ?? existing.latitude;
        if (!isValidLatLng(lat, patch.longitude)) {
          throw new OfflineInvalidInput("invalid latitude/longitude");
        }
        updateValues.longitude = patch.longitude;
      }
      if (patch.geofenceRadiusM !== undefined)
        updateValues.geofenceRadiusM = patch.geofenceRadiusM;
      if (patch.verification !== undefined) {
        if (patch.verification.methods.length === 0) {
          throw new OfflineInvalidInput(
            "verification.methods must not be empty",
          );
        }
        updateValues.verification = patch.verification;
      }
      if (patch.spotRewards !== undefined)
        updateValues.spotRewards = patch.spotRewards;
      if (patch.collectionEntryAliases !== undefined)
        updateValues.collectionEntryAliases = patch.collectionEntryAliases;
      if (patch.isActive !== undefined) updateValues.isActive = patch.isActive;
      if (patch.metadata !== undefined) updateValues.metadata = patch.metadata;

      if (Object.keys(updateValues).length === 0) return existing;

      try {
        const [row] = await db
          .update(offlineCheckInSpots)
          .set(updateValues)
          .where(eq(offlineCheckInSpots.id, existing.id))
          .returning();
        if (!row) throw new OfflineSpotNotFound(spotId);
        return row;
      } catch (err) {
        if (isUniqueViolation(err) && patch.alias) {
          throw new OfflineSpotAliasConflict(patch.alias);
        }
        throw err;
      }
    },

    async deleteSpot(organizationId: string, spotId: string): Promise<void> {
      const deleted = await db
        .delete(offlineCheckInSpots)
        .where(
          and(
            eq(offlineCheckInSpots.id, spotId),
            eq(offlineCheckInSpots.organizationId, organizationId),
          ),
        )
        .returning({ id: offlineCheckInSpots.id });
      if (deleted.length === 0) throw new OfflineSpotNotFound(spotId);
    },

    async listSpots(
      organizationId: string,
      campaignKey: string,
    ): Promise<OfflineCheckInSpot[]> {
      const campaign = await loadCampaignByKey(organizationId, campaignKey);
      return db
        .select()
        .from(offlineCheckInSpots)
        .where(eq(offlineCheckInSpots.campaignId, campaign.id))
        .orderBy(asc(offlineCheckInSpots.sortOrder));
    },

    // ─── QR / manual code ─────────────────────────────────────

    /**
     * Mint N one-time QR tokens for a spot. Each token is a fresh UUID;
     * the KV layer stores the (spotId, jti) tuple so consumption is
     * single-use. Returns the bare tokens — caller turns them into QR
     * images / printables out-of-band.
     */
    async mintQrTokens(
      organizationId: string,
      spotId: string,
      count: number,
      ttlSeconds: number,
    ): Promise<{ tokens: string[]; expiresAt: Date }> {
      const rows = await db
        .select()
        .from(offlineCheckInSpots)
        .where(
          and(
            eq(offlineCheckInSpots.id, spotId),
            eq(offlineCheckInSpots.organizationId, organizationId),
          ),
        )
        .limit(1);
      if (!rows[0]) throw new OfflineSpotNotFound(spotId);
      const tokens: string[] = [];
      for (let i = 0; i < count; i++) {
        const jti = crypto.randomUUID();
        await nonceStore.mintOneTimeToken(spotId, jti, ttlSeconds);
        tokens.push(jti);
      }
      return { tokens, expiresAt: new Date(Date.now() + ttlSeconds * 1000) };
    },

    /**
     * Rotate the manual staff-issued check-in code for a spot. Returns
     * the new code (6-digit string) and its expiry. Caller is the spot
     * staff's tablet/phone — they show the code to the player who types
     * it into the H5.
     */
    async rotateManualCode(
      organizationId: string,
      spotId: string,
      ttlSeconds = 60,
    ): Promise<{ code: string; rotatesAt: Date }> {
      const rows = await db
        .select()
        .from(offlineCheckInSpots)
        .where(
          and(
            eq(offlineCheckInSpots.id, spotId),
            eq(offlineCheckInSpots.organizationId, organizationId),
          ),
        )
        .limit(1);
      if (!rows[0]) throw new OfflineSpotNotFound(spotId);
      // 6-digit zero-padded code in [000000, 999999]
      const n = Math.floor(Math.random() * 1_000_000);
      const code = String(n).padStart(6, "0");
      await nonceStore.setManualCode(spotId, code, ttlSeconds);
      return { code, rotatesAt: new Date(Date.now() + ttlSeconds * 1000) };
    },

    // ─── Progress queries ─────────────────────────────────────

    async getProgress(params: {
      organizationId: string;
      campaignKey: string;
      endUserId: string;
    }): Promise<OfflineCheckInUserProgressRow> {
      const campaign = await loadCampaignByKey(
        params.organizationId,
        params.campaignKey,
      );
      const rows = await db
        .select()
        .from(offlineCheckInUserProgress)
        .where(
          and(
            eq(offlineCheckInUserProgress.campaignId, campaign.id),
            eq(offlineCheckInUserProgress.endUserId, params.endUserId),
          ),
        )
        .limit(1);
      const row = rows[0];
      if (row) return row;
      // Empty default — same shape as the row, but zeroed and not
      // persisted. Avoids a write on every read for new participants.
      const now = new Date();
      return {
        campaignId: campaign.id,
        endUserId: params.endUserId,
        organizationId: params.organizationId,
        spotsCompleted: [],
        totalCount: 0,
        lastSpotId: null,
        lastCheckInAt: null,
        dailyCount: 0,
        dailyDates: [],
        completedAt: null,
        version: 0,
        createdAt: now,
        updatedAt: now,
      };
    },

    async listProgress(params: {
      organizationId: string;
      campaignKey: string;
    } & PageParams): Promise<Page<OfflineCheckInUserProgressRow>> {
      const campaign = await loadCampaignByKey(
        params.organizationId,
        params.campaignKey,
      );
      const limit = clampLimit(params.limit);
      const conds: SQL[] = [
        eq(offlineCheckInUserProgress.campaignId, campaign.id),
      ];
      const seek = cursorWhere(
        params.cursor,
        offlineCheckInUserProgress.createdAt,
        offlineCheckInUserProgress.endUserId,
      );
      if (seek) conds.push(seek);
      if (params.q) {
        conds.push(ilike(offlineCheckInUserProgress.endUserId, `%${params.q}%`));
      }
      const rows = await db
        .select()
        .from(offlineCheckInUserProgress)
        .where(and(...conds))
        .orderBy(
          desc(offlineCheckInUserProgress.createdAt),
          desc(offlineCheckInUserProgress.endUserId),
        )
        .limit(limit + 1);
      return buildPageBy(rows, limit, (r) => ({
        createdAt: r.createdAt,
        id: r.endUserId,
      }));
    },

    // ─── Core: check-in ──────────────────────────────────────

    async checkIn(params: {
      organizationId: string;
      campaignKey: string;
      endUserId: string;
      spotAlias: string;
      lat?: number;
      lng?: number;
      accuracyM?: number;
      qrToken?: string;
      manualCode?: string;
      mediaAssetId?: string | null;
      deviceFingerprint?: string;
      ip?: string;
      country?: string;
      userAgent?: string;
      now?: Date;
    }): Promise<OfflineCheckInResult> {
      const campaign = await loadCampaignByKey(
        params.organizationId,
        params.campaignKey,
      );
      if (campaign.status === "draft" || campaign.status === "ended") {
        throw new OfflineCampaignInactive(params.campaignKey);
      }
      const now = params.now ?? new Date();
      // Out-of-window check — server enforces start/end regardless of status.
      if (campaign.startAt && now.getTime() < campaign.startAt.getTime()) {
        throw new OfflineCampaignInactive(`${params.campaignKey} (not started)`);
      }
      if (campaign.endAt && now.getTime() > campaign.endAt.getTime()) {
        throw new OfflineCampaignInactive(`${params.campaignKey} (ended)`);
      }

      const spot = await loadSpotByAlias(campaign.id, params.spotAlias);
      if (!spot.isActive) throw new OfflineSpotInactive(params.spotAlias);

      const mode = campaign.mode as OfflineCheckInMode;
      const dateKey = naturalDateKey(now, campaign.timezone);
      const marker = progressMarker(mode, spot.alias, dateKey);

      // Step 1 — verification dispatch. Throws OfflineVerificationFailed
      // on rejection; we still want to log the attempt.
      const verifyInput: VerifyInput = {
        lat: params.lat,
        lng: params.lng,
        accuracyM: params.accuracyM,
        qrToken: params.qrToken,
        manualCode: params.manualCode,
        photoMediaAssetId: params.mediaAssetId ?? null,
      };
      let verifiedVia: VerifiedKind[] = [];
      let distanceM: number | null = null;
      let rejectReason: string | null = null;
      try {
        const r = await verify(spot.verification, verifyInput, {
          spotLat: spot.latitude,
          spotLng: spot.longitude,
          spotId: spot.id,
          consumeOneTimeToken: nonceStore.consumeOneTimeToken,
          getActiveManualCode: nonceStore.getActiveManualCode,
        });
        verifiedVia = r.verifiedVia;
        distanceM = r.distanceM;
      } catch (err) {
        if (err instanceof OfflineVerificationFailed) {
          rejectReason = err.message;
        } else {
          throw err;
        }
      }

      // Always log the attempt (success or failure).
      await db.insert(offlineCheckInLogs).values({
        campaignId: campaign.id,
        spotId: spot.id,
        organizationId: params.organizationId,
        endUserId: params.endUserId,
        accepted: rejectReason === null,
        rejectReason,
        verifiedVia,
        latitude: params.lat ?? null,
        longitude: params.lng ?? null,
        accuracyM: params.accuracyM ?? null,
        distanceM,
        mediaAssetId: params.mediaAssetId ?? null,
        deviceFingerprint: params.deviceFingerprint ?? null,
        ip: params.ip ?? null,
        country: params.country ?? null,
        userAgent: params.userAgent ?? null,
        nonce: params.qrToken ?? null,
      });

      if (rejectReason !== null) {
        // Emit attempt event even on rejection (analytics needs the funnel).
        if (events) {
          await events.emit("offline_check_in.attempted", {
            organizationId: params.organizationId,
            endUserId: params.endUserId,
            campaignId: campaign.id,
            spotId: spot.id,
            accepted: false,
            rejectReason,
            verifiedVia,
            lat: params.lat ?? null,
            lng: params.lng ?? null,
            accuracyM: params.accuracyM ?? null,
            distanceM,
            country: params.country ?? null,
          });
        }
        throw new OfflineVerificationFailed(rejectReason);
      }

      // Step 2 — atomic upsert into progress with contains-guard.
      // The `WHERE NOT (spots_completed @> [marker])` clause is the
      // anti-double-spot lock: two concurrent check-ins to the same
      // spot serialize and the loser gets zero rows.
      const dailyDateAlreadyHit =
        mode === "daily"
          ? sql`${offlineCheckInUserProgress.dailyDates} @> ${JSON.stringify([dateKey])}::jsonb`
          : sql`false`;

      const upserted = await db
        .insert(offlineCheckInUserProgress)
        .values({
          campaignId: campaign.id,
          endUserId: params.endUserId,
          organizationId: params.organizationId,
          spotsCompleted: [marker],
          totalCount: 1,
          lastSpotId: spot.id,
          lastCheckInAt: now,
          dailyCount: mode === "daily" ? 1 : 0,
          dailyDates: mode === "daily" ? [dateKey] : [],
          completedAt: null,
          version: 1,
        })
        .onConflictDoUpdate({
          target: [
            offlineCheckInUserProgress.campaignId,
            offlineCheckInUserProgress.endUserId,
          ],
          set: {
            spotsCompleted: sql`${offlineCheckInUserProgress.spotsCompleted} || ${JSON.stringify([marker])}::jsonb`,
            totalCount: sql`${offlineCheckInUserProgress.totalCount} + 1`,
            lastSpotId: spot.id,
            lastCheckInAt: now,
            dailyCount: sql`CASE WHEN ${dailyDateAlreadyHit} THEN ${offlineCheckInUserProgress.dailyCount} ELSE ${offlineCheckInUserProgress.dailyCount} + 1 END`,
            dailyDates: sql`CASE WHEN ${dailyDateAlreadyHit} THEN ${offlineCheckInUserProgress.dailyDates} ELSE ${offlineCheckInUserProgress.dailyDates} || ${JSON.stringify([dateKey])}::jsonb END`,
            version: sql`${offlineCheckInUserProgress.version} + 1`,
          },
          setWhere: sql`NOT (${offlineCheckInUserProgress.spotsCompleted} @> ${JSON.stringify([marker])}::jsonb)`,
        })
        .returning();

      // Step 3 — re-fetch the row regardless of whether we won the race.
      // If `upserted` is empty, the marker was already there; in that
      // case we report "already-checked-in for this spot" by returning
      // accepted=false with a short reason and skipping reward grant.
      const progressRows = upserted.length
        ? upserted
        : await db
            .select()
            .from(offlineCheckInUserProgress)
            .where(
              and(
                eq(offlineCheckInUserProgress.campaignId, campaign.id),
                eq(offlineCheckInUserProgress.endUserId, params.endUserId),
              ),
            )
            .limit(1);
      const progress = progressRows[0]!;
      const alreadyDone = upserted.length === 0;

      // Step 4 — grant spot reward iff we won the race.
      const granted: RewardEntry[] = [];
      if (!alreadyDone && spot.spotRewards.length > 0) {
        // Idempotency ledger: insert (rewardKey="spot:<alias>") ON CONFLICT
        // DO NOTHING. Inserter grants; loser is a no-op.
        const ledgerInserted = await db
          .insert(offlineCheckInGrants)
          .values({
            campaignId: campaign.id,
            endUserId: params.endUserId,
            rewardKey: `spot:${spot.alias}`,
            organizationId: params.organizationId,
            rewardItems: spot.spotRewards,
          })
          .onConflictDoNothing()
          .returning();
        if (ledgerInserted.length > 0) {
          await grantRewards(
            rewardServices,
            params.organizationId,
            params.endUserId,
            spot.spotRewards,
            "offline_check_in.spot",
            `${campaign.id}:${spot.id}`,
          );
          granted.push(...spot.spotRewards);
        }
      }

      // Step 5 — completion check + completion reward.
      let justCompleted = false;
      if (!alreadyDone && !progress.completedAt) {
        const spotsCount = await db.$count(
          offlineCheckInSpots,
          eq(offlineCheckInSpots.campaignId, campaign.id),
        );
        const reachedCompletion = evaluateCompletion(
          campaign.completionRule,
          spotsCount,
          {
            totalCount: progress.totalCount,
            dailyCount: progress.dailyCount,
            spotsCompleted: progress.spotsCompleted,
          },
        );
        if (reachedCompletion) {
          // Stamp completed_at and grant completion rewards via ledger.
          const completionLedger = await db
            .insert(offlineCheckInGrants)
            .values({
              campaignId: campaign.id,
              endUserId: params.endUserId,
              rewardKey: "completion",
              organizationId: params.organizationId,
              rewardItems: campaign.completionRewards,
            })
            .onConflictDoNothing()
            .returning();
          if (completionLedger.length > 0) {
            justCompleted = true;
            await db
              .update(offlineCheckInUserProgress)
              .set({ completedAt: now })
              .where(
                and(
                  eq(offlineCheckInUserProgress.campaignId, campaign.id),
                  eq(offlineCheckInUserProgress.endUserId, params.endUserId),
                ),
              );
            progress.completedAt = now;
            if (campaign.completionRewards.length > 0) {
              await grantRewards(
                rewardServices,
                params.organizationId,
                params.endUserId,
                campaign.completionRewards,
                "offline_check_in.completion",
                campaign.id,
              );
              granted.push(...campaign.completionRewards);
            }
            if (events) {
              await events.emit("offline_check_in.campaign_completed", {
                organizationId: params.organizationId,
                endUserId: params.endUserId,
                campaignId: campaign.id,
                totalCount: progress.totalCount,
              });
            }
          }
        }
      }

      // Step 6 — analytics events (always emit on accepted attempt).
      if (events) {
        await events.emit("offline_check_in.attempted", {
          organizationId: params.organizationId,
          endUserId: params.endUserId,
          campaignId: campaign.id,
          spotId: spot.id,
          accepted: true,
          rejectReason: null,
          verifiedVia,
          lat: params.lat ?? null,
          lng: params.lng ?? null,
          accuracyM: params.accuracyM ?? null,
          distanceM,
          country: params.country ?? null,
        });
        if (!alreadyDone) {
          await events.emit("offline_check_in.completed", {
            organizationId: params.organizationId,
            endUserId: params.endUserId,
            campaignId: campaign.id,
            spotId: spot.id,
            lat: params.lat ?? null,
            lng: params.lng ?? null,
            distanceM,
          });
        }
      }

      return {
        accepted: true,
        granted,
        justCompleted,
        verifiedVia,
        progress,
        distanceM,
        rejectReason: alreadyDone ? "already_checked_in" : null,
      };
    },
  };
}

export type OfflineCheckInService = ReturnType<typeof createOfflineCheckInService>;
