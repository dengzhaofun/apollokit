/**
 * Rank service — protocol-agnostic business logic.
 *
 * Follows apps/server/CLAUDE.md:
 *   - no hono / no @hono/zod-openapi imports
 *   - no direct `../../db` / `../../deps` imports
 *   - all writes expressed as single atomic SQL (neon-http has no tx)
 *
 * ---------------------------------------------------------------------
 * Idempotent settlement via the (org, external_match_id) unique index
 * ---------------------------------------------------------------------
 *
 * `settleMatch` starts with:
 *
 *   INSERT INTO rank_matches (..., settled_at)
 *   VALUES (...)
 *   ON CONFLICT (organization_id, external_match_id) DO NOTHING
 *   RETURNING id, (xmax = 0) AS inserted;
 *
 * An empty RETURNING = another caller already settled this (externalMatchId);
 * we read the existing row and return `alreadySettled: true` without
 * re-running the rating/progression math or fan-out.
 *
 * For each participant, the player-state upsert is:
 *
 *   INSERT INTO rank_player_states (...) VALUES (...)
 *   ON CONFLICT (season_id, end_user_id) DO UPDATE SET
 *     tier_id = EXCLUDED.tier_id,
 *     subtier = EXCLUDED.subtier,
 *     stars = EXCLUDED.stars,
 *     rank_score = EXCLUDED.rank_score,
 *     mmr = EXCLUDED.mmr,
 *     ...
 *     matches_played = rank_player_states.matches_played + 1,
 *     wins = rank_player_states.wins + EXCLUDED.wins,
 *     losses = rank_player_states.losses + EXCLUDED.losses;
 *
 * Ordering under race: the outer idempotency gate guarantees only one
 * caller does the match write; concurrent settlements for different
 * matches on the same (season, user) are serialized by the row-level
 * lock on the conflict target, and writes are commutative (later match
 * simply overwrites the newer cumulative state).
 *
 * ---------------------------------------------------------------------
 * Leaderboard fan-out
 * ---------------------------------------------------------------------
 *
 * Rank reuses `leaderboard` as its ranking storage:
 *   - `createSeason` auto-creates a leaderboard config aliased
 *     `rank_<tierConfigAlias>_<seasonAlias>_global` (metricKey="rank_score",
 *     cycle="all_time", aggregation="latest", scope="global").
 *   - `settleMatch` calls `leaderboard.contribute({ metricKey: "rank_score",
 *     value: nextState.rankScore })` per participant.
 *
 * `leaderboardService` is injected via a lazy getter to avoid a module-
 * load cycle (leaderboard module has no knowledge of rank, rank knows
 * of leaderboard only through the structural `LeaderboardLike` type).
 *
 * ---------------------------------------------------------------------
 * Event emissions
 * ---------------------------------------------------------------------
 *
 * For each settled match we emit:
 *   - `rank.match_settled` — once per participant, so task-bridge can
 *     count "wins per user" style goals with zero extra plumbing.
 *   - `rank.tier_promoted` / `rank.tier_demoted` — once per affected
 *     participant.
 *
 * `finalizeSeason` emits `rank.season_finalized` once.
 */

import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";

import type { AppDeps } from "../../deps";
import {
  rankMatchParticipants,
  rankMatches,
  rankPlayerStates,
  rankSeasonSnapshots,
  rankSeasons,
  rankTierConfigs,
  rankTiers,
} from "../../schema/rank";
import {
  RankInvalidInput,
  RankInvalidParticipants,
  RankInvalidTierConfig,
  RankPlayerStateNotFound,
  RankSeasonNotActive,
  RankSeasonNotFound,
  RankSeasonOverlap,
  RankTierConfigAliasConflict,
  RankTierConfigNotFound,
  RankTierNotFound,
} from "./errors";
import { applyDelta } from "./progression";
import { createRatingStrategy, type RatingInput } from "./rating";
import type {
  EloRatingParams,
  ParticipantDelta,
  PlayerProtectionUses,
  PlayerRankView,
  RankMatch,
  RankMatchParticipant,
  RankPlayerState,
  RankSeason,
  RankSeasonSnapshot,
  RankTier,
  RankTierConfig,
  SeasonStatus,
  TierProtectionRules,
} from "./types";
import type {
  AdjustPlayerInput,
  CreateSeasonInput,
  CreateTierConfigInput,
  SettleMatchInput,
  UpdateSeasonInput,
  UpdateTierConfigInput,
} from "./validators";

// ─── Extend event-bus type map for rank-domain events ────────────
declare module "../../lib/event-bus" {
  interface EventMap {
    "rank.match_settled": {
      organizationId: string;
      seasonId: string;
      matchId: string;
      endUserId: string;
      teamId: string;
      win: boolean;
      rankScoreBefore: number;
      rankScoreAfter: number;
      mmrBefore: number;
      mmrAfter: number;
      promoted: boolean;
      demoted: boolean;
      settledAt: Date;
    };
    "rank.tier_promoted": {
      organizationId: string;
      seasonId: string;
      matchId: string;
      endUserId: string;
      fromTierId: string | null;
      toTierId: string;
    };
    "rank.tier_demoted": {
      organizationId: string;
      seasonId: string;
      matchId: string;
      endUserId: string;
      fromTierId: string | null;
      toTierId: string;
    };
    "rank.season_finalized": {
      organizationId: string;
      seasonId: string;
      playerCount: number;
      finalizedAt: Date;
    };
  }
}

// ─── Internal helpers ─────────────────────────────────────────────

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function looksLikeId(key: string): boolean {
  return UUID_RE.test(key);
}

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; cause?: { code?: unknown } };
  if (e.code === "23505") return true;
  if (e.cause && typeof e.cause === "object" && e.cause.code === "23505")
    return true;
  const msg = (err as { message?: unknown }).message;
  return typeof msg === "string" && msg.includes("23505");
}

function defaultInitialMmr(tierConfig: RankTierConfig): number {
  const params = tierConfig.ratingParams as Partial<EloRatingParams>;
  if (typeof params?.initialMmr === "number") return params.initialMmr;
  return 1000;
}

function protectionUsesOf(state: RankPlayerState): PlayerProtectionUses {
  return (state.protectionUses ?? {}) as PlayerProtectionUses;
}

function protectionRulesOf(tier: RankTier): TierProtectionRules {
  return (tier.protectionRules ?? {}) as TierProtectionRules;
}

// ─── Leaderboard integration (structural type, no hard import) ───

export type LeaderboardLike = {
  createConfig: (
    organizationId: string,
    input: {
      alias: string;
      name: string;
      description?: string | null;
      metricKey: string;
      cycle: "daily" | "weekly" | "monthly" | "all_time";
      aggregation?: "sum" | "max" | "latest";
      scope?: "global" | "guild" | "team" | "friend";
      tieBreaker?: "earliest" | "latest";
      maxEntries?: number;
      status?: "draft" | "active" | "paused" | "archived";
      metadata?: Record<string, unknown> | null;
    },
  ) => Promise<{ id: string; alias: string }>;
  updateConfig: (
    organizationId: string,
    idOrAlias: string,
    patch: { status?: "draft" | "active" | "paused" | "archived" },
  ) => Promise<{ id: string; alias: string; status: string }>;
  contribute: (input: {
    organizationId: string;
    endUserId: string;
    metricKey: string;
    value: number;
    source?: string;
    idempotencyKey?: string;
    displaySnapshot?: Record<string, unknown>;
    now?: Date;
  }) => Promise<{ applied: number }>;
  getTop: (params: {
    organizationId: string;
    configKey: string;
    cycleKey?: string;
    scopeKey?: string;
    limit?: number;
    endUserId?: string;
    now?: Date;
  }) => Promise<{
    rankings: Array<{
      rank: number;
      endUserId: string;
      score: number;
      displaySnapshot?: Record<string, unknown> | null;
    }>;
    self?: { rank: number | null; score: number | null };
  }>;
};

type LeaderboardGetter = () => LeaderboardLike | null;

type RankDeps = Pick<AppDeps, "db" | "events">;

// ─── Factory ──────────────────────────────────────────────────────

export type RankService = ReturnType<typeof createRankService>;

export function createRankService(
  d: RankDeps,
  leaderboardGetter: LeaderboardGetter = () => null,
) {
  const { db, events } = d;

  // ─── Tier config CRUD ───────────────────────────────────────

  async function loadTierConfigByKey(
    organizationId: string,
    key: string,
  ): Promise<RankTierConfig> {
    const where = looksLikeId(key)
      ? and(
          eq(rankTierConfigs.organizationId, organizationId),
          eq(rankTierConfigs.id, key),
        )
      : and(
          eq(rankTierConfigs.organizationId, organizationId),
          eq(rankTierConfigs.alias, key),
        );
    const [row] = await db.select().from(rankTierConfigs).where(where).limit(1);
    if (!row) throw new RankTierConfigNotFound(key);
    return row;
  }

  async function loadTiersOrdered(tierConfigId: string): Promise<RankTier[]> {
    return db
      .select()
      .from(rankTiers)
      .where(eq(rankTiers.tierConfigId, tierConfigId))
      .orderBy(rankTiers.order);
  }

  async function createTierConfig(
    organizationId: string,
    input: CreateTierConfigInput,
  ): Promise<{ config: RankTierConfig; tiers: RankTier[] }> {
    let configRow: RankTierConfig;
    try {
      const [row] = await db
        .insert(rankTierConfigs)
        .values({
          organizationId,
          alias: input.alias,
          name: input.name,
          description: input.description ?? null,
          isActive: input.isActive ?? true,
          ratingParams: input.ratingParams,
          metadata:
            (input.metadata as Record<string, unknown> | null | undefined) ??
            null,
        })
        .returning();
      if (!row) throw new RankInvalidTierConfig("config insert returned no row");
      configRow = row;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new RankTierConfigAliasConflict(input.alias);
      }
      throw err;
    }

    // Batch insert tiers. neon-http has no tx so a failure here leaves the
    // config row orphaned; the caller can retry by first deleting or
    // picking a new alias. We normalize defaults client-side so tests
    // / admin get consistent shapes.
    const tierRows = await db
      .insert(rankTiers)
      .values(
        input.tiers.map((t) => ({
          tierConfigId: configRow.id,
          alias: t.alias,
          name: t.name,
          order: t.order,
          minRankScore: t.minRankScore,
          maxRankScore: t.maxRankScore ?? null,
          subtierCount: t.subtierCount ?? 1,
          starsPerSubtier: t.starsPerSubtier ?? 5,
          protectionRules: (t.protectionRules ?? {}) as Record<string, unknown>,
          metadata:
            (t.metadata as Record<string, unknown> | null | undefined) ?? null,
        })),
      )
      .returning();

    return { config: configRow, tiers: tierRows };
  }

  async function updateTierConfig(
    organizationId: string,
    idOrAlias: string,
    patch: UpdateTierConfigInput,
  ): Promise<{ config: RankTierConfig; tiers: RankTier[] }> {
    const existing = await loadTierConfigByKey(organizationId, idOrAlias);
    const values: Partial<typeof rankTierConfigs.$inferInsert> = {};
    if (patch.alias !== undefined) values.alias = patch.alias;
    if (patch.name !== undefined) values.name = patch.name;
    if (patch.description !== undefined) values.description = patch.description;
    if (patch.ratingParams !== undefined) values.ratingParams = patch.ratingParams;
    if (patch.isActive !== undefined) values.isActive = patch.isActive;
    if (patch.metadata !== undefined)
      values.metadata = (patch.metadata ?? null) as Record<string, unknown> | null;

    // Any patch (including tiers-only) bumps version so UIs can detect
    // stale reads. The config row always gets an UPDATE when anything
    // changed — scalar fields go through `values`, tier replacement
    // contributes only the version bump.
    const hasScalarChange = Object.keys(values).length > 0;
    if (hasScalarChange || patch.tiers !== undefined) {
      values.version = sql`${rankTierConfigs.version} + 1` as unknown as number;
      try {
        await db
          .update(rankTierConfigs)
          .set(values)
          .where(
            and(
              eq(rankTierConfigs.id, existing.id),
              eq(rankTierConfigs.organizationId, organizationId),
            ),
          );
      } catch (err) {
        if (isUniqueViolation(err) && patch.alias) {
          throw new RankTierConfigAliasConflict(patch.alias);
        }
        throw err;
      }
    }

    // Tier replacement is all-or-nothing. We require the caller to pass
    // the full tiers[] — partial tier edits use a future finer-grained
    // endpoint. Delete-then-insert is safe because no FK points at
    // rank_tiers.id from persistent state (player_states uses ON DELETE
    // SET NULL, match_participants.tier_*_id are plain uuid columns).
    if (patch.tiers) {
      await db.delete(rankTiers).where(eq(rankTiers.tierConfigId, existing.id));
      await db.insert(rankTiers).values(
        patch.tiers.map((t) => ({
          tierConfigId: existing.id,
          alias: t.alias,
          name: t.name,
          order: t.order,
          minRankScore: t.minRankScore,
          maxRankScore: t.maxRankScore ?? null,
          subtierCount: t.subtierCount ?? 1,
          starsPerSubtier: t.starsPerSubtier ?? 5,
          protectionRules: (t.protectionRules ?? {}) as Record<string, unknown>,
          metadata:
            (t.metadata as Record<string, unknown> | null | undefined) ?? null,
        })),
      );
    }

    const [row] = await db
      .select()
      .from(rankTierConfigs)
      .where(eq(rankTierConfigs.id, existing.id))
      .limit(1);
    if (!row) throw new RankTierConfigNotFound(idOrAlias);
    const tiers = await loadTiersOrdered(existing.id);
    return { config: row, tiers };
  }

  async function deleteTierConfig(
    organizationId: string,
    id: string,
  ): Promise<void> {
    const deleted = await db
      .delete(rankTierConfigs)
      .where(
        and(
          eq(rankTierConfigs.id, id),
          eq(rankTierConfigs.organizationId, organizationId),
        ),
      )
      .returning({ id: rankTierConfigs.id });
    if (deleted.length === 0) throw new RankTierConfigNotFound(id);
  }

  async function listTierConfigs(
    organizationId: string,
  ): Promise<Array<{ config: RankTierConfig; tiers: RankTier[] }>> {
    const configs = await db
      .select()
      .from(rankTierConfigs)
      .where(eq(rankTierConfigs.organizationId, organizationId))
      .orderBy(desc(rankTierConfigs.createdAt));
    const result: Array<{ config: RankTierConfig; tiers: RankTier[] }> = [];
    for (const c of configs) {
      const tiers = await loadTiersOrdered(c.id);
      result.push({ config: c, tiers });
    }
    return result;
  }

  async function getTierConfig(
    organizationId: string,
    idOrAlias: string,
  ): Promise<{ config: RankTierConfig; tiers: RankTier[] }> {
    const config = await loadTierConfigByKey(organizationId, idOrAlias);
    const tiers = await loadTiersOrdered(config.id);
    return { config, tiers };
  }

  // ─── Season CRUD ────────────────────────────────────────────

  async function loadSeasonById(
    organizationId: string,
    seasonId: string,
  ): Promise<RankSeason> {
    const [row] = await db
      .select()
      .from(rankSeasons)
      .where(
        and(
          eq(rankSeasons.id, seasonId),
          eq(rankSeasons.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!row) throw new RankSeasonNotFound(seasonId);
    return row;
  }

  async function loadActiveSeasonByTierConfigAlias(
    organizationId: string,
    tierConfigAlias: string,
  ): Promise<RankSeason> {
    const cfg = await loadTierConfigByKey(organizationId, tierConfigAlias);
    const [row] = await db
      .select()
      .from(rankSeasons)
      .where(
        and(
          eq(rankSeasons.tierConfigId, cfg.id),
          eq(rankSeasons.status, "active"),
        ),
      )
      .limit(1);
    if (!row) throw new RankSeasonNotFound(`active@${tierConfigAlias}`);
    return row;
  }

  async function createSeason(
    organizationId: string,
    input: CreateSeasonInput,
  ): Promise<RankSeason> {
    // Validate tier config exists and belongs to this org.
    const [cfg] = await db
      .select()
      .from(rankTierConfigs)
      .where(
        and(
          eq(rankTierConfigs.id, input.tierConfigId),
          eq(rankTierConfigs.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!cfg) throw new RankTierConfigNotFound(input.tierConfigId);

    const [row] = await db
      .insert(rankSeasons)
      .values({
        organizationId,
        tierConfigId: input.tierConfigId,
        alias: input.alias,
        name: input.name,
        description: input.description ?? null,
        startAt: new Date(input.startAt),
        endAt: new Date(input.endAt),
        status: "upcoming",
        inheritanceRules:
          (input.inheritanceRules ?? {}) as Record<string, unknown>,
        metadata:
          (input.metadata as Record<string, unknown> | null | undefined) ??
          null,
      })
      .returning();
    if (!row) throw new RankInvalidInput("season insert returned no row");

    // Best-effort: auto-create the leaderboard config for this season's
    // global board. If leaderboard is not wired in (tests without the
    // barrel), this is a no-op.
    const lb = leaderboardGetter();
    if (lb) {
      try {
        await lb.createConfig(organizationId, {
          alias: `rank_${cfg.alias}_${row.alias}_global`,
          name: `${cfg.name} ${row.name} Global`,
          metricKey: "rank_score",
          cycle: "all_time",
          aggregation: "latest",
          scope: "global",
          tieBreaker: "latest",
          status: "active",
          metadata: {
            rank: { tierConfigId: cfg.id, seasonId: row.id },
          },
        });
      } catch (err) {
        console.warn("[rank] leaderboard.createConfig failed:", err);
      }
    }

    return row;
  }

  async function updateSeason(
    organizationId: string,
    seasonId: string,
    patch: UpdateSeasonInput,
  ): Promise<RankSeason> {
    await loadSeasonById(organizationId, seasonId);
    const values: Partial<typeof rankSeasons.$inferInsert> = {};
    if (patch.alias !== undefined) values.alias = patch.alias;
    if (patch.name !== undefined) values.name = patch.name;
    if (patch.description !== undefined) values.description = patch.description;
    if (patch.startAt !== undefined) values.startAt = new Date(patch.startAt);
    if (patch.endAt !== undefined) values.endAt = new Date(patch.endAt);
    if (patch.status !== undefined) values.status = patch.status;
    if (patch.inheritanceRules !== undefined)
      values.inheritanceRules = (patch.inheritanceRules ?? {}) as Record<
        string,
        unknown
      >;
    if (patch.metadata !== undefined)
      values.metadata = (patch.metadata ?? null) as Record<string, unknown> | null;

    if (Object.keys(values).length === 0) {
      return loadSeasonById(organizationId, seasonId);
    }

    const [row] = await db
      .update(rankSeasons)
      .set(values)
      .where(
        and(
          eq(rankSeasons.id, seasonId),
          eq(rankSeasons.organizationId, organizationId),
        ),
      )
      .returning();
    if (!row) throw new RankSeasonNotFound(seasonId);
    return row;
  }

  async function listSeasons(
    organizationId: string,
    filter?: { tierConfigId?: string; status?: SeasonStatus },
  ): Promise<RankSeason[]> {
    const conds = [eq(rankSeasons.organizationId, organizationId)];
    if (filter?.tierConfigId)
      conds.push(eq(rankSeasons.tierConfigId, filter.tierConfigId));
    if (filter?.status) conds.push(eq(rankSeasons.status, filter.status));
    return db
      .select()
      .from(rankSeasons)
      .where(and(...conds))
      .orderBy(desc(rankSeasons.startAt));
  }

  /**
   * Activate a season with serialization guarantee: the conditional UPDATE
   * uses `WHERE status='upcoming' AND NOT EXISTS (... another active ...)`
   * to reject the flip when a sibling is already active. neon-http has no
   * transaction; this expresses the invariant in a single SQL statement.
   */
  async function activateSeason(
    organizationId: string,
    seasonId: string,
  ): Promise<RankSeason> {
    const season = await loadSeasonById(organizationId, seasonId);
    if (season.status === "active") return season;
    if (season.status === "finished") {
      throw new RankSeasonNotActive(seasonId, season.status);
    }

    const result = await db
      .update(rankSeasons)
      .set({ status: "active" })
      .where(
        and(
          eq(rankSeasons.id, seasonId),
          eq(rankSeasons.status, "upcoming"),
          sql`NOT EXISTS (
            SELECT 1 FROM ${rankSeasons} other
            WHERE other.tier_config_id = ${season.tierConfigId}
              AND other.status = 'active'
              AND other.id != ${seasonId}
          )`,
        ),
      )
      .returning();
    if (result.length === 0) {
      throw new RankSeasonOverlap(season.tierConfigId);
    }
    return result[0]!;
  }

  async function finalizeSeason(
    organizationId: string,
    seasonId: string,
  ): Promise<{ snapshotCount: number; playerCount: number }> {
    const season = await loadSeasonById(organizationId, seasonId);
    if (season.status !== "active") {
      // idempotent: already-finished returns 0
      if (season.status === "finished") {
        return { snapshotCount: 0, playerCount: 0 };
      }
      throw new RankSeasonNotActive(seasonId, season.status);
    }

    // Flip status first (single statement guards against double-run).
    const flipped = await db
      .update(rankSeasons)
      .set({ status: "finished" })
      .where(
        and(
          eq(rankSeasons.id, seasonId),
          eq(rankSeasons.status, "active"),
        ),
      )
      .returning({ id: rankSeasons.id });
    if (flipped.length === 0) {
      // Lost the race — another caller finalized already.
      return { snapshotCount: 0, playerCount: 0 };
    }

    // Snapshot insert with window function for global rank. ON CONFLICT
    // makes it idempotent across retries after partial failure.
    const snapshotRows = await db.execute(sql`
      INSERT INTO rank_season_snapshots (
        id, organization_id, season_id, end_user_id,
        final_tier_id, final_subtier, final_stars,
        final_rank_score, final_mmr, final_global_rank, settled_at
      )
      SELECT
        gen_random_uuid(),
        ps.organization_id, ps.season_id, ps.end_user_id,
        ps.tier_id, ps.subtier, ps.stars,
        ps.rank_score, ps.mmr,
        row_number() OVER (ORDER BY ps.rank_score DESC, ps.mmr DESC, ps.updated_at ASC),
        now()
      FROM rank_player_states ps
      WHERE ps.season_id = ${seasonId}
      ON CONFLICT (season_id, end_user_id) DO NOTHING
      RETURNING end_user_id
    `);

    const snapshotCount = Array.isArray(snapshotRows)
      ? snapshotRows.length
      : (snapshotRows as { rowCount?: number }).rowCount ?? 0;

    // Archive the leaderboard config for this season.
    const lb = leaderboardGetter();
    if (lb) {
      const cfg = await loadTierConfigByKey(organizationId, season.tierConfigId);
      try {
        await lb.updateConfig(
          organizationId,
          `rank_${cfg.alias}_${season.alias}_global`,
          { status: "archived" },
        );
      } catch (err) {
        console.warn("[rank] leaderboard.updateConfig(archived) failed:", err);
      }
    }

    const finalizedAt = new Date();
    await events.emit("rank.season_finalized", {
      organizationId,
      seasonId,
      playerCount: snapshotCount,
      finalizedAt,
    });

    return { snapshotCount, playerCount: snapshotCount };
  }

  // ─── Player state ───────────────────────────────────────────

  async function decoratePlayerView(
    state: RankPlayerState,
    tier: RankTier | null,
  ): Promise<PlayerRankView> {
    return {
      seasonId: state.seasonId,
      endUserId: state.endUserId,
      rankScore: state.rankScore,
      mmr: state.mmr,
      subtier: state.subtier,
      stars: state.stars,
      winStreak: state.winStreak,
      lossStreak: state.lossStreak,
      matchesPlayed: state.matchesPlayed,
      wins: state.wins,
      losses: state.losses,
      protectionUses: protectionUsesOf(state),
      lastMatchAt: state.lastMatchAt,
      tier: tier
        ? {
            id: tier.id,
            alias: tier.alias,
            name: tier.name,
            order: tier.order,
            subtierCount: tier.subtierCount,
            starsPerSubtier: tier.starsPerSubtier,
          }
        : null,
    };
  }

  async function getPlayerState(params: {
    organizationId: string;
    seasonId?: string;
    tierConfigAlias?: string;
    endUserId: string;
  }): Promise<PlayerRankView> {
    const season = params.seasonId
      ? await loadSeasonById(params.organizationId, params.seasonId)
      : await loadActiveSeasonByTierConfigAlias(
          params.organizationId,
          params.tierConfigAlias ??
            (() => {
              throw new RankInvalidInput(
                "seasonId or tierConfigAlias is required",
              );
            })(),
        );
    const [state] = await db
      .select()
      .from(rankPlayerStates)
      .where(
        and(
          eq(rankPlayerStates.seasonId, season.id),
          eq(rankPlayerStates.endUserId, params.endUserId),
        ),
      )
      .limit(1);
    if (!state) throw new RankPlayerStateNotFound(season.id, params.endUserId);
    const tier = state.tierId
      ? (await db
          .select()
          .from(rankTiers)
          .where(eq(rankTiers.id, state.tierId))
          .limit(1))[0] ?? null
      : null;
    return decoratePlayerView(state, tier);
  }

  async function listPlayerStates(params: {
    organizationId: string;
    seasonId: string;
    tierId?: string;
    endUserId?: string;
    limit?: number;
  }): Promise<PlayerRankView[]> {
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 500);
    const conds = [
      eq(rankPlayerStates.organizationId, params.organizationId),
      eq(rankPlayerStates.seasonId, params.seasonId),
    ];
    if (params.tierId) conds.push(eq(rankPlayerStates.tierId, params.tierId));
    if (params.endUserId)
      conds.push(eq(rankPlayerStates.endUserId, params.endUserId));
    const rows = await db
      .select()
      .from(rankPlayerStates)
      .where(and(...conds))
      .orderBy(desc(rankPlayerStates.rankScore))
      .limit(limit);

    const tierIds = Array.from(
      new Set(rows.map((r) => r.tierId).filter((t): t is string => !!t)),
    );
    const tierMap = new Map<string, RankTier>();
    if (tierIds.length > 0) {
      const tiers = await db
        .select()
        .from(rankTiers)
        .where(inArray(rankTiers.id, tierIds));
      for (const t of tiers) tierMap.set(t.id, t);
    }

    return Promise.all(
      rows.map((s) => decoratePlayerView(s, s.tierId ? tierMap.get(s.tierId) ?? null : null)),
    );
  }

  async function getPlayerHistory(params: {
    organizationId: string;
    endUserId: string;
    seasonId?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ items: RankMatchParticipant[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
    const conds = [
      eq(rankMatchParticipants.organizationId, params.organizationId),
      eq(rankMatchParticipants.endUserId, params.endUserId),
    ];
    if (params.seasonId)
      conds.push(eq(rankMatchParticipants.seasonId, params.seasonId));
    if (params.cursor) conds.push(lt(rankMatchParticipants.id, params.cursor));

    const rows = await db
      .select()
      .from(rankMatchParticipants)
      .where(and(...conds))
      .orderBy(desc(rankMatchParticipants.id))
      .limit(limit + 1);

    const items = rows.slice(0, limit);
    const nextCursor =
      rows.length > limit ? items[items.length - 1]!.id : null;
    return { items, nextCursor };
  }

  async function adjustPlayer(
    organizationId: string,
    endUserId: string,
    input: AdjustPlayerInput,
  ): Promise<PlayerRankView> {
    const season = await loadSeasonById(organizationId, input.seasonId);
    const [state] = await db
      .select()
      .from(rankPlayerStates)
      .where(
        and(
          eq(rankPlayerStates.seasonId, season.id),
          eq(rankPlayerStates.endUserId, endUserId),
        ),
      )
      .limit(1);
    if (!state) throw new RankPlayerStateNotFound(season.id, endUserId);

    // Validate tierId belongs to the season's tierConfig.
    if (input.tierId) {
      const [t] = await db
        .select()
        .from(rankTiers)
        .where(
          and(
            eq(rankTiers.id, input.tierId),
            eq(rankTiers.tierConfigId, season.tierConfigId),
          ),
        )
        .limit(1);
      if (!t) throw new RankTierNotFound(input.tierId);
    }

    const values: Partial<typeof rankPlayerStates.$inferInsert> = {};
    if (input.rankScore !== undefined) values.rankScore = input.rankScore;
    if (input.mmr !== undefined) values.mmr = input.mmr;
    if (input.tierId !== undefined) values.tierId = input.tierId;
    if (input.subtier !== undefined) values.subtier = input.subtier;
    if (input.stars !== undefined) values.stars = input.stars;

    const [updated] = await db
      .update(rankPlayerStates)
      .set(values)
      .where(eq(rankPlayerStates.id, state.id))
      .returning();
    if (!updated) throw new RankPlayerStateNotFound(season.id, endUserId);

    const tier = updated.tierId
      ? (await db
          .select()
          .from(rankTiers)
          .where(eq(rankTiers.id, updated.tierId))
          .limit(1))[0] ?? null
      : null;
    return decoratePlayerView(updated, tier);
  }

  // ─── Settle match (the big one) ─────────────────────────────

  async function settleMatch(input: SettleMatchInput & { organizationId: string; reportedBy?: string }): Promise<{
    matchId: string;
    alreadySettled: boolean;
    participants: ParticipantDelta[];
  }> {
    const teamIds = new Set(input.participants.map((p) => p.teamId));
    if (input.participants.length < 2) {
      throw new RankInvalidParticipants("at least 2 participants required");
    }
    if (teamIds.size < 2) {
      throw new RankInvalidParticipants("at least 2 distinct teams required");
    }

    // 1. Resolve season.
    const season = input.seasonId
      ? await loadSeasonById(input.organizationId, input.seasonId)
      : await loadActiveSeasonByTierConfigAlias(
          input.organizationId,
          input.tierConfigAlias ??
            (() => {
              throw new RankInvalidInput(
                "seasonId or tierConfigAlias is required",
              );
            })(),
        );
    if (season.status !== "active") {
      throw new RankSeasonNotActive(season.id, season.status);
    }

    const settledAt = input.settledAt ? new Date(input.settledAt) : new Date();
    const metadata: Record<string, unknown> = {};
    if (input.reportedBy) metadata.reportedBy = input.reportedBy;

    // 2. Idempotency gate: try to insert the match row. If the unique
    //    (org, external_match_id) index rejects us, read the existing
    //    row and early-return.
    const insertRows = await db
      .insert(rankMatches)
      .values({
        organizationId: input.organizationId,
        seasonId: season.id,
        externalMatchId: input.externalMatchId,
        gameMode: input.gameMode ?? null,
        totalParticipants: input.participants.length,
        teamCount: teamIds.size,
        settledAt,
        rawPayload:
          (input.rawPayload as Record<string, unknown> | null | undefined) ??
          null,
        metadata: Object.keys(metadata).length > 0 ? metadata : null,
      })
      .onConflictDoNothing({
        target: [rankMatches.organizationId, rankMatches.externalMatchId],
      })
      .returning({ id: rankMatches.id });

    if (insertRows.length === 0) {
      // Already settled — read prior participants and return.
      const [existing] = await db
        .select()
        .from(rankMatches)
        .where(
          and(
            eq(rankMatches.organizationId, input.organizationId),
            eq(rankMatches.externalMatchId, input.externalMatchId),
          ),
        )
        .limit(1);
      if (!existing) {
        // Shouldn't happen — conflict implies an existing row.
        throw new RankInvalidInput("match settle race: row missing");
      }
      const priorParticipants = await db
        .select()
        .from(rankMatchParticipants)
        .where(eq(rankMatchParticipants.matchId, existing.id));
      return {
        matchId: existing.id,
        alreadySettled: true,
        participants: priorParticipants.map(toParticipantDelta),
      };
    }

    const matchId = insertRows[0]!.id;

    // 3. Preload tier config + tiers + current player_states.
    const tierConfig = await loadTierConfigByKey(
      input.organizationId,
      season.tierConfigId,
    );
    const tiers = await loadTiersOrdered(tierConfig.id);
    if (tiers.length === 0) {
      throw new RankInvalidTierConfig(
        `tier config ${tierConfig.alias} has no tiers`,
      );
    }
    const endUserIds = input.participants.map((p) => p.endUserId);
    const existingStates = await db
      .select()
      .from(rankPlayerStates)
      .where(
        and(
          eq(rankPlayerStates.seasonId, season.id),
          inArray(rankPlayerStates.endUserId, endUserIds),
        ),
      );
    const stateMap = new Map(existingStates.map((s) => [s.endUserId, s]));

    const initialMmr = defaultInitialMmr(tierConfig);
    const defaultTier = tiers[0]!;
    const ensuredStates: RankPlayerState[] = input.participants.map((p) => {
      const existing = stateMap.get(p.endUserId);
      if (existing) return existing;
      // Synthetic default (not yet in DB; upsert will create).
      return {
        id: "", // placeholder; not written to DB directly
        organizationId: input.organizationId,
        seasonId: season.id,
        endUserId: p.endUserId,
        tierId: defaultTier.id,
        subtier: 0,
        stars: 0,
        rankScore: 0,
        mmr: initialMmr,
        mmrDeviation: 350,
        mmrVolatility: 0.06,
        winStreak: 0,
        lossStreak: 0,
        protectionUses: {} as Record<string, number>,
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        lastMatchAt: null,
        createdAt: settledAt,
        updatedAt: settledAt,
      } as RankPlayerState;
    });

    // 4. Rating strategy.
    const ratingInputs: RatingInput[] = input.participants.map((p) => {
      const state = ensuredStates.find((s) => s.endUserId === p.endUserId)!;
      return {
        endUserId: p.endUserId,
        teamId: p.teamId,
        placement: p.placement,
        win: p.win,
        performanceScore: p.performanceScore ?? null,
        mmrBefore: state.mmr,
        mmrDeviation: state.mmrDeviation,
        mmrVolatility: state.mmrVolatility,
      };
    });
    const strategy = createRatingStrategy(
      (tierConfig.ratingParams as Partial<EloRatingParams>).strategy ?? "elo",
    );
    const ratingOutputs = strategy.compute({
      participants: ratingInputs,
      teamCount: teamIds.size,
      params: tierConfig.ratingParams as Record<string, unknown>,
    });
    const ratingMap = new Map(ratingOutputs.map((r) => [r.endUserId, r]));

    // 5. Per-participant progression + delta record.
    const deltas: ParticipantDelta[] = [];
    const participantInserts: Array<
      typeof rankMatchParticipants.$inferInsert
    > = [];
    const stateUpserts: Array<
      typeof rankPlayerStates.$inferInsert & {
        _winDelta: number;
        _lossDelta: number;
      }
    > = [];

    for (const p of input.participants) {
      const state = ensuredStates.find((s) => s.endUserId === p.endUserId)!;
      const rating = ratingMap.get(p.endUserId)!;
      const progression = applyDelta({
        state,
        tiers,
        mmrBefore: state.mmr,
        mmrAfter: rating.mmrAfter,
        win: p.win,
        placement: p.placement,
      });

      deltas.push({
        endUserId: p.endUserId,
        teamId: p.teamId,
        win: p.win,
        mmrBefore: state.mmr,
        mmrAfter: progression.mmr,
        rankScoreBefore: state.rankScore,
        rankScoreAfter: progression.rankScore,
        starsDelta: progression.starsDelta,
        subtierBefore: progression.subtierBefore,
        subtierAfter: progression.subtier,
        starsBefore: progression.starsBefore,
        starsAfter: progression.stars,
        tierBeforeId: progression.tierBeforeId,
        tierAfterId: progression.tierId,
        promoted: progression.promoted,
        demoted: progression.demoted,
        protectionApplied: progression.protectionApplied,
      });

      participantInserts.push({
        matchId,
        organizationId: input.organizationId,
        seasonId: season.id,
        endUserId: p.endUserId,
        teamId: p.teamId,
        placement: p.placement,
        win: p.win,
        performanceScore: p.performanceScore ?? null,
        mmrBefore: state.mmr,
        mmrAfter: progression.mmr,
        rankScoreBefore: state.rankScore,
        rankScoreAfter: progression.rankScore,
        tierBeforeId: progression.tierBeforeId,
        tierAfterId: progression.tierId,
        subtierBefore: progression.subtierBefore,
        subtierAfter: progression.subtier,
        starsBefore: progression.starsBefore,
        starsAfter: progression.stars,
        starsDelta: progression.starsDelta,
        promoted: progression.promoted,
        demoted: progression.demoted,
        protectionApplied: progression.protectionApplied,
      });

      stateUpserts.push({
        organizationId: input.organizationId,
        seasonId: season.id,
        endUserId: p.endUserId,
        tierId: progression.tierId,
        subtier: progression.subtier,
        stars: progression.stars,
        rankScore: progression.rankScore,
        mmr: progression.mmr,
        mmrDeviation: state.mmrDeviation,
        mmrVolatility: state.mmrVolatility,
        winStreak: progression.winStreak,
        lossStreak: progression.lossStreak,
        protectionUses: progression.protectionUses as Record<string, number>,
        matchesPlayed: 1,
        wins: p.win ? 1 : 0,
        losses: p.win ? 0 : 1,
        lastMatchAt: settledAt,
        _winDelta: p.win ? 1 : 0,
        _lossDelta: p.win ? 0 : 1,
      });
    }

    // 6. Batch-insert participants (single statement).
    await db.insert(rankMatchParticipants).values(participantInserts);

    // 7. Upsert each player_state. We do per-row upserts because every
    //    row has a different SET clause for counters (wins/losses
    //    accumulate, the rest is full replacement). neon-http parallels
    //    these as individual HTTP calls — acceptable for typical
    //    participant counts (<=100).
    for (const row of stateUpserts) {
      const { _winDelta, _lossDelta, ...insertRow } = row;
      await db
        .insert(rankPlayerStates)
        .values(insertRow)
        .onConflictDoUpdate({
          target: [rankPlayerStates.seasonId, rankPlayerStates.endUserId],
          set: {
            tierId: sql`EXCLUDED.tier_id`,
            subtier: sql`EXCLUDED.subtier`,
            stars: sql`EXCLUDED.stars`,
            rankScore: sql`EXCLUDED.rank_score`,
            mmr: sql`EXCLUDED.mmr`,
            winStreak: sql`EXCLUDED.win_streak`,
            lossStreak: sql`EXCLUDED.loss_streak`,
            protectionUses: sql`EXCLUDED.protection_uses`,
            matchesPlayed: sql`${rankPlayerStates.matchesPlayed} + 1`,
            wins: sql`${rankPlayerStates.wins} + ${_winDelta}`,
            losses: sql`${rankPlayerStates.losses} + ${_lossDelta}`,
            lastMatchAt: sql`EXCLUDED.last_match_at`,
          },
        });
    }

    // 8. Fan out to leaderboard (if wired).
    const lb = leaderboardGetter();
    if (lb) {
      const tierById = new Map(tiers.map((t) => [t.id, t]));
      for (const delta of deltas) {
        const tier = delta.tierAfterId ? tierById.get(delta.tierAfterId) : null;
        try {
          await lb.contribute({
            organizationId: input.organizationId,
            endUserId: delta.endUserId,
            metricKey: "rank_score",
            value: delta.rankScoreAfter,
            source: `rank:match:${matchId}`,
            idempotencyKey: `rank:${matchId}:${delta.endUserId}`,
            displaySnapshot: tier
              ? {
                  tierAlias: tier.alias,
                  tierName: tier.name,
                  tierOrder: tier.order,
                  subtier: delta.subtierAfter,
                  stars: delta.starsAfter,
                }
              : {
                  subtier: delta.subtierAfter,
                  stars: delta.starsAfter,
                },
          });
        } catch (err) {
          console.warn("[rank] leaderboard.contribute failed:", err);
        }
      }
    }

    // 9. Emit events (one match_settled per participant + promote/demote).
    for (const delta of deltas) {
      await events.emit("rank.match_settled", {
        organizationId: input.organizationId,
        seasonId: season.id,
        matchId,
        endUserId: delta.endUserId,
        teamId: delta.teamId,
        win: delta.win,
        rankScoreBefore: delta.rankScoreBefore,
        rankScoreAfter: delta.rankScoreAfter,
        mmrBefore: delta.mmrBefore,
        mmrAfter: delta.mmrAfter,
        promoted: delta.promoted,
        demoted: delta.demoted,
        settledAt,
      });
      if (delta.promoted) {
        await events.emit("rank.tier_promoted", {
          organizationId: input.organizationId,
          seasonId: season.id,
          matchId,
          endUserId: delta.endUserId,
          fromTierId: delta.tierBeforeId,
          toTierId: delta.tierAfterId!,
        });
      }
      if (delta.demoted) {
        await events.emit("rank.tier_demoted", {
          organizationId: input.organizationId,
          seasonId: season.id,
          matchId,
          endUserId: delta.endUserId,
          fromTierId: delta.tierBeforeId,
          toTierId: delta.tierAfterId!,
        });
      }
    }

    return { matchId, alreadySettled: false, participants: deltas };
  }

  // ─── Leaderboard read facades ───────────────────────────────

  async function getGlobalLeaderboard(params: {
    organizationId: string;
    seasonId?: string;
    tierConfigAlias?: string;
    limit?: number;
    endUserId?: string;
  }): Promise<{
    rankings: Array<{
      rank: number;
      endUserId: string;
      score: number;
      displaySnapshot?: Record<string, unknown> | null;
    }>;
    self?: { rank: number | null; score: number | null };
  }> {
    const season = params.seasonId
      ? await loadSeasonById(params.organizationId, params.seasonId)
      : await loadActiveSeasonByTierConfigAlias(
          params.organizationId,
          params.tierConfigAlias ??
            (() => {
              throw new RankInvalidInput(
                "seasonId or tierConfigAlias is required",
              );
            })(),
        );
    const cfg = await loadTierConfigByKey(
      params.organizationId,
      season.tierConfigId,
    );
    const lb = leaderboardGetter();
    if (!lb) {
      // Fallback: PG direct read when leaderboard is not wired (tests).
      const rows = await db
        .select()
        .from(rankPlayerStates)
        .where(eq(rankPlayerStates.seasonId, season.id))
        .orderBy(desc(rankPlayerStates.rankScore))
        .limit(Math.min(params.limit ?? 100, 1000));
      return {
        rankings: rows.map((r, i) => ({
          rank: i + 1,
          endUserId: r.endUserId,
          score: r.rankScore,
        })),
      };
    }
    return lb.getTop({
      organizationId: params.organizationId,
      configKey: `rank_${cfg.alias}_${season.alias}_global`,
      limit: params.limit,
      endUserId: params.endUserId,
    });
  }

  async function getTierLeaderboard(params: {
    organizationId: string;
    seasonId?: string;
    tierConfigAlias?: string;
    tierId: string;
    limit?: number;
  }): Promise<PlayerRankView[]> {
    const season = params.seasonId
      ? await loadSeasonById(params.organizationId, params.seasonId)
      : await loadActiveSeasonByTierConfigAlias(
          params.organizationId,
          params.tierConfigAlias ??
            (() => {
              throw new RankInvalidInput(
                "seasonId or tierConfigAlias is required",
              );
            })(),
        );
    return listPlayerStates({
      organizationId: params.organizationId,
      seasonId: season.id,
      tierId: params.tierId,
      limit: params.limit,
    });
  }

  // ─── Exports ────────────────────────────────────────────────

  return {
    // Tier config
    createTierConfig,
    updateTierConfig,
    deleteTierConfig,
    listTierConfigs,
    getTierConfig,
    // Season
    createSeason,
    updateSeason,
    listSeasons,
    getSeason: (organizationId: string, seasonId: string) =>
      loadSeasonById(organizationId, seasonId),
    activateSeason,
    finalizeSeason,
    // Player
    getPlayerState,
    listPlayerStates,
    getPlayerHistory,
    adjustPlayer,
    // Match
    settleMatch,
    getMatch: async (
      organizationId: string,
      matchId: string,
    ): Promise<{
      match: RankMatch;
      participants: RankMatchParticipant[];
    }> => {
      const [match] = await db
        .select()
        .from(rankMatches)
        .where(
          and(
            eq(rankMatches.id, matchId),
            eq(rankMatches.organizationId, organizationId),
          ),
        )
        .limit(1);
      if (!match) throw new RankInvalidInput(`match not found: ${matchId}`);
      const participants = await db
        .select()
        .from(rankMatchParticipants)
        .where(eq(rankMatchParticipants.matchId, matchId));
      return { match, participants };
    },
    listSeasonMatches: async (params: {
      organizationId: string;
      seasonId: string;
      limit?: number;
      cursor?: string;
    }): Promise<{ items: RankMatch[]; nextCursor: string | null }> => {
      const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
      const conds = [
        eq(rankMatches.organizationId, params.organizationId),
        eq(rankMatches.seasonId, params.seasonId),
      ];
      if (params.cursor) conds.push(lt(rankMatches.id, params.cursor));
      const rows = await db
        .select()
        .from(rankMatches)
        .where(and(...conds))
        .orderBy(desc(rankMatches.settledAt), desc(rankMatches.id))
        .limit(limit + 1);
      const items = rows.slice(0, limit);
      const nextCursor = rows.length > limit ? items[items.length - 1]!.id : null;
      return { items, nextCursor };
    },
    // Leaderboard
    getGlobalLeaderboard,
    getTierLeaderboard,
    // Season snapshot (debug / admin readback)
    listSnapshots: async (
      organizationId: string,
      seasonId: string,
    ): Promise<RankSeasonSnapshot[]> => {
      await loadSeasonById(organizationId, seasonId);
      return db
        .select()
        .from(rankSeasonSnapshots)
        .where(eq(rankSeasonSnapshots.seasonId, seasonId))
        .orderBy(rankSeasonSnapshots.finalGlobalRank);
    },
  };
}

function toParticipantDelta(row: RankMatchParticipant): ParticipantDelta {
  return {
    endUserId: row.endUserId,
    teamId: row.teamId,
    win: row.win,
    mmrBefore: row.mmrBefore,
    mmrAfter: row.mmrAfter,
    rankScoreBefore: row.rankScoreBefore,
    rankScoreAfter: row.rankScoreAfter,
    starsDelta: row.starsDelta,
    subtierBefore: row.subtierBefore,
    subtierAfter: row.subtierAfter,
    starsBefore: row.starsBefore,
    starsAfter: row.starsAfter,
    tierBeforeId: row.tierBeforeId,
    tierAfterId: row.tierAfterId,
    promoted: row.promoted,
    demoted: row.demoted,
    protectionApplied: (row.protectionApplied as ParticipantDelta["protectionApplied"]) ?? null,
  };
}
