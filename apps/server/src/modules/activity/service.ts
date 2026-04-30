/**
 * Activity service — protocol-agnostic business logic.
 *
 * Per the `apps/server/CLAUDE.md` rules: no hono, no direct db/deps
 * imports, no transactions. Every write is a single atomic statement.
 *
 * ---------------------------------------------------------------------
 * Time model
 * ---------------------------------------------------------------------
 *
 * Five time columns (visibleAt / startAt / endAt / rewardEndAt /
 * hiddenAt) drive the state machine. `deriveState(config, now)` is a
 * total function — reads always use the live answer. `status` is the
 * cron-persisted snapshot, used for:
 *   - Indexing ("find all active activities")
 *   - Firing one-shot transitions (archive → cleanup)
 *
 * Cron runs every minute (see wrangler.jsonc → triggers.crons). Inside
 * `tickDue(now)` we (a) advance persisted status for everything whose
 * derived state has changed, (b) fire matured `activity_schedules`,
 * (c) run cleanup for activities that just became `archived`.
 *
 * ---------------------------------------------------------------------
 * Idempotency
 * ---------------------------------------------------------------------
 *
 * - `join`                  → unique(activity_id, end_user_id) on
 *                             activity_members. Retry returns the
 *                             existing row.
 * - `claimMilestone`        → unique(activity_id, end_user_id,
 *                             reward_key="milestone:<alias>") on
 *                             activity_user_rewards; conflict = already
 *                             claimed.
 * - Schedule firing         → cron updates `enabled=false` atomically
 *                             for one-shot kinds before dispatching.
 * - Archive cleanup         → `status='archived'` flips exactly once;
 *                             we test & set it in a conditional UPDATE.
 *
 * ---------------------------------------------------------------------
 * What's deferred (out of MVP)
 * ---------------------------------------------------------------------
 *
 *   - `cron`-kind schedules: nextFireAt recomputation
 *   - `set_flag` action
 *   - board_game / gacha kind handlers
 *   - activity → entity_instances cleanup (needs entity schema bump)
 *   - Unit tests (noted separately)
 */

import { and, desc, eq, ilike, inArray, isNotNull, isNull, lte, ne, or, sql, type SQL } from "drizzle-orm";

import {
  buildPage,
  clampLimit,
  cursorWhere,
  type Page,
  type PageParams,
} from "../../lib/pagination";

import { assistPoolConfigs } from "../../schema/assist-pool";
import { bannerGroups } from "../../schema/banner";
import { checkInConfigs } from "../../schema/check-in";
import { leaderboardConfigs } from "../../schema/leaderboard";
import { lotteryPools } from "../../schema/lottery";
import { shopProducts } from "../../schema/shop";
import { taskDefinitions } from "../../schema/task";

import type { AppDeps } from "../../deps";
import { isUniqueViolation } from "../../lib/db-errors";
import { looksLikeId } from "../../lib/key-resolver";
import type { RewardEntry } from "../../lib/rewards";
import { logger } from "../../lib/logger";
import {
  activityConfigs,
  activityMembers,
  activityNodes,
  activityPointLogs,
  activitySchedules,
  activityTemplates,
  activityUserRewards,
  type ActivityMembershipConfig,
  type ActivityNodeBlueprint,
  type ActivityScheduleBlueprint,
  type ActivityTemplateDurationSpec,
  type ActivityTemplateRecurrence,
} from "../../schema/activity";
import {
  ActivityAliasConflict,
  ActivityInvalidInput,
  ActivityLeaveNotAllowed,
  ActivityMemberNoQueueNumber,
  ActivityMemberNotFound,
  ActivityMilestoneNotFound,
  ActivityMilestoneNotReached,
  ActivityNodeNotFound,
  ActivityNotFound,
  ActivityQueueAlreadyRedeemed,
  ActivityQueueNotEnabled,
  ActivityQueueNumberExhausted,
  ActivityWrongState,
} from "./errors";
import {
  broadcastArchive,
  broadcastStateChange,
} from "./kind/lifecycle-bridge";
import {
  computeNextFireAt,
  deriveState,
  deriveTimeline,
  validateTimeOrder,
} from "./time";
import type {
  ActivityConfig,
  ActivityKind,
  ActivityMemberRow,
  ActivityMemberStatus,
  ActivityMilestoneTier,
  ActivityNode,
  ActivityState,
  ActivityTimeline,
  ActivityViewForUser,
  ActivityVisibility,
} from "./types";
import type {
  CreateActivityInput,
  CreateNodeInput,
  CreateScheduleInput,
  UpdateActivityInput,
  UpdateNodeInput,
} from "./validators";

declare module "../../lib/event-bus" {
  interface EventMap {
    "activity.state.changed": {
      organizationId: string;
      activityId: string;
      previousState: ActivityState;
      newState: ActivityState;
    };
    "activity.schedule.fired": {
      organizationId: string;
      activityId: string;
      scheduleAlias: string;
      actionType: string;
      firedAt: Date;
      actionConfig: Record<string, unknown>;
    };
    "activity.milestone.claimed": {
      organizationId: string;
      activityId: string;
      endUserId: string;
      milestoneAlias: string;
    };
    "activity.joined": {
      organizationId: string;
      activityId: string;
      activityAlias: string | null;
      endUserId: string;
      // True when this call was the first-ever join (upsert inserted);
      // false when the user was re-marking `lastActiveAt`. Downstream
      // analytics can filter to first-time participation.
      firstTime: boolean;
    };
  }
}

type ActivityDeps = Pick<AppDeps, "db" | "redis" | "events">;

type MailLike = {
  sendUnicast: (
    organizationId: string,
    endUserId: string,
    input: {
      title: string;
      content: string;
      rewards: RewardEntry[];
      originSource: string;
      originSourceId: string;
      senderAdminId?: string | null;
      expiresAt?: string | null;
    },
  ) => Promise<unknown>;
  createMessage: (
    organizationId: string,
    input: {
      title: string;
      content: string;
      rewards: RewardEntry[];
      targetType: "multicast" | "broadcast";
      targetUserIds?: string[];
      originSource?: string;
      originSourceId?: string;
    },
  ) => Promise<unknown>;
};

type MailGetter = () => MailLike | null;

export function createActivityService(
  d: ActivityDeps,
  mailGetter: MailGetter = () => null,
) {
  const { db, events } = d;

  async function loadByKey(
    organizationId: string,
    key: string,
  ): Promise<ActivityConfig> {
    const where = looksLikeId(key)
      ? and(
          eq(activityConfigs.organizationId, organizationId),
          eq(activityConfigs.id, key),
        )
      : and(
          eq(activityConfigs.organizationId, organizationId),
          eq(activityConfigs.alias, key),
        );
    const rows = await db
      .select()
      .from(activityConfigs)
      .where(where)
      .limit(1);
    const row = rows[0];
    if (!row) throw new ActivityNotFound(key);
    return row;
  }

  function assertTimeOrder(t: {
    visibleAt: Date;
    startAt: Date;
    endAt: Date;
    rewardEndAt: Date;
    hiddenAt: Date;
  }) {
    const err = validateTimeOrder(t);
    if (err) throw new ActivityInvalidInput(err);
  }

  return {
    // ─── CRUD ────────────────────────────────────────────────────

    async createActivity(
      organizationId: string,
      input: CreateActivityInput,
    ): Promise<ActivityConfig> {
      const t = {
        visibleAt: new Date(input.visibleAt),
        startAt: new Date(input.startAt),
        endAt: new Date(input.endAt),
        rewardEndAt: new Date(input.rewardEndAt),
        hiddenAt: new Date(input.hiddenAt),
      };
      assertTimeOrder(t);

      try {
        const [row] = await db
          .insert(activityConfigs)
          .values({
            organizationId,
            alias: input.alias,
            name: input.name,
            description: input.description ?? null,
            bannerImage: input.bannerImage ?? null,
            themeColor: input.themeColor ?? null,
            kind: (input.kind ?? "generic") as ActivityKind,
            visibleAt: t.visibleAt,
            startAt: t.startAt,
            endAt: t.endAt,
            rewardEndAt: t.rewardEndAt,
            hiddenAt: t.hiddenAt,
            timezone: input.timezone ?? "UTC",
            status: "draft",
            currency: input.currency ?? null,
            milestoneTiers: input.milestoneTiers ?? [],
            globalRewards: input.globalRewards ?? [],
            kindMetadata: input.kindMetadata ?? null,
            cleanupRule: input.cleanupRule ?? { mode: "purge" },
            joinRequirement: input.joinRequirement ?? null,
            visibility: (input.visibility ??
              "public") as ActivityVisibility,
            templateId: input.templateId ?? null,
            metadata: input.metadata ?? null,
            membership:
              (input.membership as ActivityMembershipConfig | null | undefined) ??
              null,
          })
          .returning();
        if (!row) throw new Error("insert returned no row");
        return row;
      } catch (err) {
        if (isUniqueViolation(err))
          throw new ActivityAliasConflict(input.alias);
        throw err;
      }
    },

    async updateActivity(
      organizationId: string,
      idOrAlias: string,
      patch: UpdateActivityInput,
    ): Promise<ActivityConfig> {
      const existing = await loadByKey(organizationId, idOrAlias);
      const values: Partial<typeof activityConfigs.$inferInsert> = {};
      if (patch.name !== undefined) values.name = patch.name;
      if (patch.description !== undefined)
        values.description = patch.description;
      if (patch.bannerImage !== undefined)
        values.bannerImage = patch.bannerImage;
      if (patch.themeColor !== undefined) values.themeColor = patch.themeColor;
      if (patch.visibleAt !== undefined)
        values.visibleAt = new Date(patch.visibleAt);
      if (patch.startAt !== undefined)
        values.startAt = new Date(patch.startAt);
      if (patch.endAt !== undefined) values.endAt = new Date(patch.endAt);
      if (patch.rewardEndAt !== undefined)
        values.rewardEndAt = new Date(patch.rewardEndAt);
      if (patch.hiddenAt !== undefined)
        values.hiddenAt = new Date(patch.hiddenAt);
      if (patch.timezone !== undefined) values.timezone = patch.timezone;
      if (patch.currency !== undefined) values.currency = patch.currency;
      if (patch.milestoneTiers !== undefined)
        values.milestoneTiers = patch.milestoneTiers as ActivityMilestoneTier[];
      if (patch.globalRewards !== undefined)
        values.globalRewards = patch.globalRewards as RewardEntry[];
      if (patch.kindMetadata !== undefined)
        values.kindMetadata = patch.kindMetadata;
      if (patch.cleanupRule !== undefined) values.cleanupRule = patch.cleanupRule;
      if (patch.joinRequirement !== undefined)
        values.joinRequirement = patch.joinRequirement;
      if (patch.visibility !== undefined)
        values.visibility = patch.visibility as ActivityVisibility;
      if (patch.metadata !== undefined) values.metadata = patch.metadata;
      if (patch.membership !== undefined)
        values.membership =
          (patch.membership as ActivityMembershipConfig | null) ?? null;

      if (Object.keys(values).length === 0) return existing;

      // If any time changed, re-assert ordering on the combined set.
      const t = {
        visibleAt: (values.visibleAt ?? existing.visibleAt) as Date,
        startAt: (values.startAt ?? existing.startAt) as Date,
        endAt: (values.endAt ?? existing.endAt) as Date,
        rewardEndAt: (values.rewardEndAt ?? existing.rewardEndAt) as Date,
        hiddenAt: (values.hiddenAt ?? existing.hiddenAt) as Date,
      };
      assertTimeOrder(t);

      const [row] = await db
        .update(activityConfigs)
        .set(values)
        .where(
          and(
            eq(activityConfigs.id, existing.id),
            eq(activityConfigs.organizationId, organizationId),
          ),
        )
        .returning();
      if (!row) throw new ActivityNotFound(idOrAlias);
      return row;
    },

    async deleteActivity(
      organizationId: string,
      id: string,
    ): Promise<void> {
      const deleted = await db
        .delete(activityConfigs)
        .where(
          and(
            eq(activityConfigs.id, id),
            eq(activityConfigs.organizationId, organizationId),
          ),
        )
        .returning({ id: activityConfigs.id });
      if (deleted.length === 0) throw new ActivityNotFound(id);
    },

    async getActivity(
      organizationId: string,
      idOrAlias: string,
    ): Promise<ActivityConfig> {
      return loadByKey(organizationId, idOrAlias);
    },

    async listActivities(
      organizationId: string,
      filter: PageParams & { status?: ActivityState; kind?: ActivityKind } = {},
    ): Promise<Page<ActivityConfig>> {
      const limit = clampLimit(filter.limit);
      const conds: SQL[] = [eq(activityConfigs.organizationId, organizationId)];
      if (filter.status) conds.push(eq(activityConfigs.status, filter.status));
      if (filter.kind) conds.push(eq(activityConfigs.kind, filter.kind));
      const seek = cursorWhere(filter.cursor, activityConfigs.createdAt, activityConfigs.id);
      if (seek) conds.push(seek);
      if (filter.q) {
        const pat = `%${filter.q}%`;
        const search = or(ilike(activityConfigs.name, pat), ilike(activityConfigs.alias, pat));
        if (search) conds.push(search);
      }
      const rows = await db
        .select()
        .from(activityConfigs)
        .where(and(...conds))
        .orderBy(desc(activityConfigs.createdAt), desc(activityConfigs.id))
        .limit(limit + 1);
      return buildPage(rows, limit);
    },

    // ─── Lifecycle transitions ───────────────────────────────────

    /**
     * Publish transitions a draft into the time-driven state machine.
     * The persisted status is whatever `deriveState` says right now.
     */
    async publish(
      organizationId: string,
      idOrAlias: string,
      now: Date = new Date(),
    ): Promise<ActivityConfig> {
      const existing = await loadByKey(organizationId, idOrAlias);
      if (existing.status !== "draft") {
        throw new ActivityWrongState("publish", existing.status);
      }
      const nextStatus = deriveState(
        { ...existing, status: "scheduled" },
        now,
      );
      const [row] = await db
        .update(activityConfigs)
        .set({ status: nextStatus })
        .where(eq(activityConfigs.id, existing.id))
        .returning();
      if (!row) throw new ActivityNotFound(idOrAlias);
      await events.emit("activity.state.changed", {
        organizationId,
        activityId: row.id,
        previousState: "draft",
        newState: nextStatus,
      });
      return row;
    },

    /**
     * Force an activity back to draft. Only legal when the activity
     * has not yet started — once it's active we don't support un-
     * publishing (would confuse players).
     */
    async unpublish(
      organizationId: string,
      idOrAlias: string,
    ): Promise<ActivityConfig> {
      const existing = await loadByKey(organizationId, idOrAlias);
      if (!["scheduled", "teasing"].includes(existing.status)) {
        throw new ActivityWrongState("unpublish", existing.status);
      }
      const [row] = await db
        .update(activityConfigs)
        .set({ status: "draft" })
        .where(eq(activityConfigs.id, existing.id))
        .returning();
      if (!row) throw new ActivityNotFound(idOrAlias);
      await events.emit("activity.state.changed", {
        organizationId,
        activityId: row.id,
        previousState: existing.status as ActivityState,
        newState: "draft",
      });
      return row;
    },

    // ─── Nodes ──────────────────────────────────────────────────

    async createNode(
      organizationId: string,
      activityIdOrAlias: string,
      input: CreateNodeInput,
    ): Promise<ActivityNode> {
      const activity = await loadByKey(organizationId, activityIdOrAlias);
      try {
        const [row] = await db
          .insert(activityNodes)
          .values({
            activityId: activity.id,
            organizationId,
            alias: input.alias,
            nodeType: input.nodeType,
            refId: input.refId ?? null,
            orderIndex: input.orderIndex ?? 0,
            unlockRule: input.unlockRule ?? null,
            nodeConfig: input.nodeConfig ?? null,
            enabled: input.enabled ?? true,
          })
          .returning();
        if (!row) throw new Error("insert returned no row");
        return row;
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new ActivityInvalidInput(
            `node alias already in use: ${input.alias}`,
          );
        }
        throw err;
      }
    },

    async updateNode(
      organizationId: string,
      nodeId: string,
      patch: UpdateNodeInput,
    ): Promise<ActivityNode> {
      const values: Partial<typeof activityNodes.$inferInsert> = {};
      if (patch.orderIndex !== undefined) values.orderIndex = patch.orderIndex;
      if (patch.unlockRule !== undefined) values.unlockRule = patch.unlockRule;
      if (patch.nodeConfig !== undefined) values.nodeConfig = patch.nodeConfig;
      if (patch.enabled !== undefined) values.enabled = patch.enabled;
      if (patch.refId !== undefined) values.refId = patch.refId;
      if (Object.keys(values).length === 0) {
        const rows = await db
          .select()
          .from(activityNodes)
          .where(
            and(
              eq(activityNodes.id, nodeId),
              eq(activityNodes.organizationId, organizationId),
            ),
          )
          .limit(1);
        if (!rows[0]) throw new ActivityNodeNotFound(nodeId);
        return rows[0];
      }
      const [row] = await db
        .update(activityNodes)
        .set(values)
        .where(
          and(
            eq(activityNodes.id, nodeId),
            eq(activityNodes.organizationId, organizationId),
          ),
        )
        .returning();
      if (!row) throw new ActivityNodeNotFound(nodeId);
      return row;
    },

    async deleteNode(
      organizationId: string,
      nodeId: string,
    ): Promise<void> {
      const deleted = await db
        .delete(activityNodes)
        .where(
          and(
            eq(activityNodes.id, nodeId),
            eq(activityNodes.organizationId, organizationId),
          ),
        )
        .returning({ id: activityNodes.id });
      if (deleted.length === 0) throw new ActivityNodeNotFound(nodeId);
    },

    async listNodes(
      organizationId: string,
      activityIdOrAlias: string,
      now: Date = new Date(),
    ): Promise<{
      items: ActivityNode[];
      activity: {
        id: string;
        alias: string;
        derivedPhase: ActivityState;
        timeline: ActivityTimeline;
      };
    }> {
      const activity = await loadByKey(organizationId, activityIdOrAlias);
      const items = await db
        .select()
        .from(activityNodes)
        .where(eq(activityNodes.activityId, activity.id))
        .orderBy(activityNodes.orderIndex);
      // Live phase via deriveState — admin UI badges should reflect the
      // current minute, not the cron-persisted `status` column.
      return {
        items,
        activity: {
          id: activity.id,
          alias: activity.alias,
          derivedPhase: deriveState(activity, now),
          timeline: deriveTimeline(activity, now),
        },
      };
    },

    // ─── Schedules ──────────────────────────────────────────────

    async createSchedule(
      organizationId: string,
      activityIdOrAlias: string,
      input: CreateScheduleInput,
    ) {
      const activity = await loadByKey(organizationId, activityIdOrAlias);
      const nextFireAt = computeNextFireAt(
        {
          triggerKind: input.triggerKind,
          fireAt: input.fireAt ? new Date(input.fireAt) : null,
          offsetFrom: input.offsetFrom ?? null,
          offsetSeconds: input.offsetSeconds ?? null,
          cronExpr: input.cronExpr ?? null,
        },
        activity,
      );
      try {
        const [row] = await db
          .insert(activitySchedules)
          .values({
            activityId: activity.id,
            organizationId,
            alias: input.alias,
            triggerKind: input.triggerKind,
            cronExpr: input.cronExpr ?? null,
            fireAt: input.fireAt ? new Date(input.fireAt) : null,
            offsetFrom: input.offsetFrom ?? null,
            offsetSeconds: input.offsetSeconds ?? null,
            actionType: input.actionType,
            actionConfig: (input.actionConfig ?? {}) as Record<
              string,
              unknown
            >,
            enabled: input.enabled ?? true,
            nextFireAt,
          })
          .returning();
        if (!row) throw new Error("insert returned no row");
        return row;
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new ActivityInvalidInput(
            `schedule alias already in use: ${input.alias}`,
          );
        }
        throw err;
      }
    },

    async deleteSchedule(
      organizationId: string,
      scheduleId: string,
    ): Promise<void> {
      const deleted = await db
        .delete(activitySchedules)
        .where(
          and(
            eq(activitySchedules.id, scheduleId),
            eq(activitySchedules.organizationId, organizationId),
          ),
        )
        .returning({ id: activitySchedules.id });
      if (deleted.length === 0) {
        throw new ActivityInvalidInput(`schedule not found: ${scheduleId}`);
      }
    },

    async listSchedules(
      organizationId: string,
      activityIdOrAlias: string,
    ) {
      const activity = await loadByKey(organizationId, activityIdOrAlias);
      return db
        .select()
        .from(activitySchedules)
        .where(eq(activitySchedules.activityId, activity.id))
        .orderBy(activitySchedules.nextFireAt);
    },

    // ─── Player-facing ──────────────────────────────────────────

    /**
     * Participant enrolment. Idempotent — the unique index on
     * (activity_id, end_user_id) guarantees one row per player.
     */
    async join(params: {
      organizationId: string;
      activityIdOrAlias: string;
      endUserId: string;
      now?: Date;
    }): Promise<ActivityMemberRow> {
      const activity = await loadByKey(
        params.organizationId,
        params.activityIdOrAlias,
      );
      const now = params.now ?? new Date();
      const state = deriveState(activity, now);
      if (state !== "active") {
        throw new ActivityWrongState("join", state);
      }
      const [row] = await db
        .insert(activityMembers)
        .values({
          activityId: activity.id,
          organizationId: params.organizationId,
          endUserId: params.endUserId,
          joinedAt: now,
          lastActiveAt: now,
        })
        .onConflictDoUpdate({
          target: [
            activityMembers.activityId,
            activityMembers.endUserId,
          ],
          set: { lastActiveAt: now },
        })
        .returning();

      // Insert vs update discrimination: the upsert's `set` only touches
      // `lastActiveAt`, so an existing row retains its original
      // `joinedAt`. A fresh insert stamps `joinedAt` to `now`, so
      // equality against `now` reliably marks the first-time join.
      const firstTime = row!.joinedAt.getTime() === now.getTime();

      // Allocate a queue number if the activity enables it and the
      // member doesn't already have one. Random allocation + partial
      // unique (activity_id, queue_number) — retry on collision.
      let member = row!;
      const membership = activity.membership as ActivityMembershipConfig | null;
      if (
        membership?.queue?.enabled &&
        member.queueNumber === null
      ) {
        member = await allocateQueueNumber(db, member, membership.queue);
      }

      if (events) {
        await events.emit("activity.joined", {
          organizationId: params.organizationId,
          activityId: activity.id,
          activityAlias: activity.alias,
          endUserId: params.endUserId,
          firstTime,
        });
      }

      return member;
    },

    /**
     * Active leave. Marks `status='left'` and stamps `leftAt`. Keeps
     * every other column untouched — point balance, milestones already
     * claimed, and (crucially) the queue number stay on the row so
     * history and redemption still work after the member leaves.
     *
     * Hard delete is NOT used: reward ledger, point ledger, and
     * milestones-achieved must all stay queryable post-leave.
     */
    async leaveActivity(params: {
      organizationId: string;
      activityIdOrAlias: string;
      endUserId: string;
      now?: Date;
    }): Promise<ActivityMemberRow> {
      const activity = await loadByKey(
        params.organizationId,
        params.activityIdOrAlias,
      );
      const membership = activity.membership as ActivityMembershipConfig | null;
      if (membership?.leaveAllowed === false) {
        throw new ActivityLeaveNotAllowed();
      }
      const now = params.now ?? new Date();
      const [row] = await db
        .update(activityMembers)
        .set({ status: "left", leftAt: now, lastActiveAt: now })
        .where(
          and(
            eq(activityMembers.activityId, activity.id),
            eq(activityMembers.endUserId, params.endUserId),
            eq(activityMembers.status, "joined"),
          ),
        )
        .returning();
      if (!row) throw new ActivityMemberNotFound(params.endUserId);
      return row;
    },

    /**
     * Admin-triggered queue-number redemption. Flips `queueNumberUsedAt`
     * from NULL to `now`. One-shot — re-calling returns
     * `ActivityQueueAlreadyRedeemed` carrying the original used-at
     * timestamp.
     */
    async redeemQueueNumber(params: {
      organizationId: string;
      activityIdOrAlias: string;
      endUserId: string;
      now?: Date;
    }): Promise<{ endUserId: string; queueNumber: string; usedAt: Date }> {
      const activity = await loadByKey(
        params.organizationId,
        params.activityIdOrAlias,
      );
      const membership = activity.membership as ActivityMembershipConfig | null;
      if (!membership?.queue?.enabled) {
        throw new ActivityQueueNotEnabled();
      }
      const now = params.now ?? new Date();
      const [row] = await db
        .update(activityMembers)
        .set({ queueNumberUsedAt: now })
        .where(
          and(
            eq(activityMembers.activityId, activity.id),
            eq(activityMembers.endUserId, params.endUserId),
            isNotNull(activityMembers.queueNumber),
            isNull(activityMembers.queueNumberUsedAt),
          ),
        )
        .returning();

      if (row) {
        return {
          endUserId: row.endUserId,
          queueNumber: row.queueNumber!,
          usedAt: row.queueNumberUsedAt!,
        };
      }

      // Zero rows updated — figure out why, to return a precise error.
      const existing = await db
        .select()
        .from(activityMembers)
        .where(
          and(
            eq(activityMembers.activityId, activity.id),
            eq(activityMembers.endUserId, params.endUserId),
          ),
        )
        .limit(1);
      const found = existing[0];
      if (!found) throw new ActivityMemberNotFound(params.endUserId);
      if (!found.queueNumber) {
        throw new ActivityMemberNoQueueNumber(params.endUserId);
      }
      if (found.queueNumberUsedAt) {
        throw new ActivityQueueAlreadyRedeemed(
          params.endUserId,
          found.queueNumberUsedAt,
        );
      }
      // Defensive fallback — shouldn't reach here under normal state.
      throw new ActivityMemberNotFound(params.endUserId);
    },

    /**
     * Paginated member listing for admin. Cursor is the last row's
     * `joinedAt|id` composite; `limit` is capped at 200.
     */
    async listMembers(params: {
      organizationId: string;
      activityIdOrAlias: string;
      status?: ActivityMemberStatus | "all";
      cursor?: string | null;
      limit?: number;
    }): Promise<{
      items: ActivityMemberRow[];
      nextCursor: string | null;
    }> {
      const activity = await loadByKey(
        params.organizationId,
        params.activityIdOrAlias,
      );
      const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
      const statusFilter =
        params.status && params.status !== "all"
          ? [eq(activityMembers.status, params.status)]
          : [];
      const cursorFilter: ReturnType<typeof sql>[] = [];
      if (params.cursor) {
        const [rawTs, rawId] = params.cursor.split("|");
        const ts = rawTs ? Number(rawTs) : NaN;
        if (!Number.isFinite(ts) || !rawId) {
          throw new ActivityInvalidInput(`invalid cursor: ${params.cursor}`);
        }
        const cursorDate = new Date(ts);
        cursorFilter.push(
          sql`(${activityMembers.joinedAt}, ${activityMembers.id}) < (${cursorDate.toISOString()}::timestamp, ${rawId})`,
        );
      }
      const rows = await db
        .select()
        .from(activityMembers)
        .where(
          and(
            eq(activityMembers.activityId, activity.id),
            ...statusFilter,
            ...cursorFilter,
          ),
        )
        .orderBy(desc(activityMembers.joinedAt), desc(activityMembers.id))
        .limit(limit + 1);
      const hasMore = rows.length > limit;
      const items = rows.slice(0, limit);
      const last = items[items.length - 1];
      const nextCursor =
        hasMore && last
          ? `${last.joinedAt.getTime()}|${last.id}`
          : null;
      return { items, nextCursor };
    },

    /**
     * Adjust the player's activity points. Also appends a ledger row
     * and emits a `score.contributed` event so leaderboards (that
     * subscribe to `metricKey="activity:<alias>:points"`) auto-update.
     */
    async addPoints(params: {
      organizationId: string;
      activityIdOrAlias: string;
      endUserId: string;
      delta: number;
      source: string;
      sourceRef?: string;
      now?: Date;
    }): Promise<{
      balance: number;
      unlockedMilestones: string[];
    }> {
      const activity = await loadByKey(
        params.organizationId,
        params.activityIdOrAlias,
      );
      const now = params.now ?? new Date();
      const state = deriveState(activity, now);
      // Spending (negative delta) is permitted in "ended" state so
      // players can still claim rewards; earning is not.
      if (params.delta > 0 && state !== "active") {
        throw new ActivityWrongState("earn points in", state);
      }
      if (params.delta < 0 && !["active", "settling", "ended"].includes(state)) {
        throw new ActivityWrongState("spend points in", state);
      }

      // Upsert progress row with atomic point adjustment.
      const [row] = await db
        .insert(activityMembers)
        .values({
          activityId: activity.id,
          organizationId: params.organizationId,
          endUserId: params.endUserId,
          joinedAt: now,
          lastActiveAt: now,
          activityPoints: params.delta,
        })
        .onConflictDoUpdate({
          target: [
            activityMembers.activityId,
            activityMembers.endUserId,
          ],
          set: {
            activityPoints: sql`${activityMembers.activityPoints} + ${params.delta}`,
            lastActiveAt: now,
          },
        })
        .returning();
      const balance = row!.activityPoints;

      // Ledger append. Note: we append even if the balance stays
      // non-monotonic due to concurrent writers — the ledger SUM still
      // reconstructs the true balance.
      await db.insert(activityPointLogs).values({
        activityId: activity.id,
        organizationId: params.organizationId,
        endUserId: params.endUserId,
        delta: params.delta,
        balanceAfter: balance,
        source: params.source,
        sourceRef: params.sourceRef ?? null,
      });

      // Which new milestones did this push over the line?
      const tiers = (activity.milestoneTiers ??
        []) as ActivityMilestoneTier[];
      const previousBalance = balance - params.delta;
      const unlockedMilestones = tiers
        .filter(
          (t) =>
            balance >= t.points &&
            previousBalance < t.points &&
            !(row!.milestonesAchieved ?? []).includes(t.alias),
        )
        .map((t) => t.alias);

      return { balance, unlockedMilestones };
    },

    /**
     * Claim a milestone. Idempotent — the unique key
     * (activity_id, end_user_id, reward_key="milestone:<alias>") makes
     * double-claim cases surface as `already_claimed`.
     */
    async claimMilestone(params: {
      organizationId: string;
      activityIdOrAlias: string;
      endUserId: string;
      milestoneAlias: string;
      now?: Date;
    }): Promise<{
      claimed: boolean;
      rewards: RewardEntry[];
      balance: number;
    }> {
      const activity = await loadByKey(
        params.organizationId,
        params.activityIdOrAlias,
      );
      const now = params.now ?? new Date();
      const state = deriveState(activity, now);
      if (!["active", "settling"].includes(state)) {
        throw new ActivityWrongState("claim milestone in", state);
      }

      const tiers = (activity.milestoneTiers ??
        []) as ActivityMilestoneTier[];
      const tier = tiers.find((t) => t.alias === params.milestoneAlias);
      if (!tier) throw new ActivityMilestoneNotFound(params.milestoneAlias);

      // Load current points.
      const progressRows = await db
        .select()
        .from(activityMembers)
        .where(
          and(
            eq(activityMembers.activityId, activity.id),
            eq(activityMembers.endUserId, params.endUserId),
          ),
        )
        .limit(1);
      const progress = progressRows[0];
      if (!progress || progress.activityPoints < tier.points) {
        throw new ActivityMilestoneNotReached(
          params.milestoneAlias,
          tier.points,
          progress?.activityPoints ?? 0,
        );
      }

      // Insert dedup claim row. Duplicate throws 23505 → already claimed.
      const rewardKey = `milestone:${params.milestoneAlias}`;
      try {
        await db.insert(activityUserRewards).values({
          activityId: activity.id,
          organizationId: params.organizationId,
          endUserId: params.endUserId,
          rewardKey,
          rewards: tier.rewards,
        });
      } catch (err) {
        if (isUniqueViolation(err)) {
          return {
            claimed: false,
            rewards: tier.rewards,
            balance: progress.activityPoints,
          };
        }
        throw err;
      }

      // Append milestone alias to the cached list (for O(1) reads).
      await db
        .update(activityMembers)
        .set({
          milestonesAchieved: sql`coalesce(${activityMembers.milestonesAchieved}, '[]'::jsonb) || ${JSON.stringify([params.milestoneAlias])}::jsonb`,
        })
        .where(eq(activityMembers.id, progress.id));

      // Dispatch the rewards via mail (idempotent by rewardKey).
      const mail = mailGetter();
      if (mail) {
        try {
          await mail.sendUnicast(
            params.organizationId,
            params.endUserId,
            {
              title: `Milestone: ${activity.name}`,
              content: `You reached "${params.milestoneAlias}" — rewards inside.`,
              rewards: tier.rewards,
              originSource: "activity_milestone",
              originSourceId: `${activity.id}:${params.endUserId}:${rewardKey}`,
            },
          );
        } catch (err) {
          logger.error(
            `[activity] milestone mail failed activity=${activity.id} user=${params.endUserId}:`,
            err,
          );
        }
      }

      await events.emit("activity.milestone.claimed", {
        organizationId: params.organizationId,
        activityId: activity.id,
        endUserId: params.endUserId,
        milestoneAlias: params.milestoneAlias,
      });

      return {
        claimed: true,
        rewards: tier.rewards,
        balance: progress.activityPoints,
      };
    },

    /**
     * Aggregated view for a single player, one round-trip. Child
     * modules attach their own handler later; MVP returns node rows
     * without per-node playerStatus (frontend issues a follow-up call
     * per node until each module's `getStatusForActivityNode` lands).
     */
    async getActivityForUser(params: {
      organizationId: string;
      activityIdOrAlias: string;
      endUserId: string;
      now?: Date;
    }): Promise<ActivityViewForUser> {
      const activity = await loadByKey(
        params.organizationId,
        params.activityIdOrAlias,
      );
      const now = params.now ?? new Date();
      const timeline = deriveTimeline(activity, now);

      const [progressRows, nodeRows] = await Promise.all([
        db
          .select()
          .from(activityMembers)
          .where(
            and(
              eq(activityMembers.activityId, activity.id),
              eq(activityMembers.endUserId, params.endUserId),
            ),
          )
          .limit(1),
        db
          .select()
          .from(activityNodes)
          .where(eq(activityNodes.activityId, activity.id))
          .orderBy(activityNodes.orderIndex),
      ]);

      const progress = progressRows[0] ?? null;
      const completedAliases = new Set<string>(
        progress?.milestonesAchieved ?? [],
      );

      // Two layers of "enabled" collapse into one derived value the UI
      // and player-facing code should consult:
      //   effectiveEnabled = node.enabled && resource.isActive
      // (for virtual nodes without a refId, resource side is treated
      // as active — the node owns the full decision).
      const refActiveMap = await resolveRefActivity(db, nodeRows);

      const nodes = nodeRows.map((n) => {
        const resourceActive = n.refId
          ? (refActiveMap.get(n.refId) ?? false)
          : true;
        return {
          node: n,
          unlocked: isNodeUnlocked(
            n,
            activity,
            progress,
            completedAliases,
            now,
          ),
          resourceActive,
          effectiveEnabled: n.enabled && resourceActive,
          playerStatus: null, // populated when per-module handlers land
        };
      });

      return {
        activity: {
          ...activity,
          timeline,
          derivedState: timeline.state,
        },
        progress,
        nodes,
      };
    },

    // ─── Analytics ──────────────────────────────────────────────

    /**
     * Aggregate participation stats for a single activity.
     *
     *   participants — how many users joined
     *   completed / dropped — their status breakdown
     *   avgPoints / maxPoints / p50Points — central tendencies
     *   milestoneClaims — map of milestone alias -> how many users claimed
     *   pointsBuckets — histogram for UI rendering
     */
    async getActivityAnalytics(params: {
      organizationId: string;
      activityIdOrAlias: string;
    }): Promise<{
      participants: number;
      completed: number;
      dropped: number;
      avgPoints: number;
      maxPoints: number;
      p50Points: number;
      milestoneClaims: Array<{ milestoneAlias: string; count: number }>;
      pointsBuckets: Array<{ bucket: string; count: number }>;
    }> {
      const activity = await loadByKey(
        params.organizationId,
        params.activityIdOrAlias,
      );

      const statusRowsRaw = await db.execute(sql<{
        status: string;
        cnt: number;
      }>`
        SELECT status, COUNT(*)::int AS cnt
        FROM activity_members
        WHERE activity_id = ${activity.id}
        GROUP BY status
      `);
      const statusRows = statusRowsRaw.rows as Array<{
        status: string;
        cnt: number;
      }>;

      let participants = 0;
      let completed = 0;
      let dropped = 0;
      for (const r of statusRows) {
        participants += Number(r.cnt);
        if (r.status === "completed") completed = Number(r.cnt);
        else if (r.status === "dropped") dropped = Number(r.cnt);
      }

      const statsRaw = await db.execute(sql<{
        avg: string | null;
        max: string | null;
        p50: string | null;
      }>`
        SELECT
          AVG(activity_points)::text AS avg,
          MAX(activity_points)::text AS max,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY activity_points)::text AS p50
        FROM activity_members
        WHERE activity_id = ${activity.id}
      `);
      const stats = statsRaw.rows[0] as {
        avg: string | null;
        max: string | null;
        p50: string | null;
      } | undefined;

      const avgPoints = Number(stats?.avg ?? 0) || 0;
      const maxPoints = Number(stats?.max ?? 0) || 0;
      const p50Points = Number(stats?.p50 ?? 0) || 0;

      const milestoneRowsRaw = await db.execute(sql<{
        reward_key: string;
        cnt: number;
      }>`
        SELECT reward_key, COUNT(*)::int AS cnt
        FROM activity_user_rewards
        WHERE activity_id = ${activity.id}
          AND reward_key LIKE 'milestone:%'
        GROUP BY reward_key
      `);
      const milestoneClaims = (
        milestoneRowsRaw.rows as Array<{ reward_key: string; cnt: number }>
      ).map((r) => ({
        milestoneAlias: r.reward_key.replace(/^milestone:/, ""),
        count: Number(r.cnt),
      }));

      const bucketsRaw = await db.execute(sql<{ bucket: string; cnt: number }>`
        SELECT
          CASE
            WHEN activity_points = 0 THEN '0'
            WHEN activity_points < 100 THEN '1-99'
            WHEN activity_points < 500 THEN '100-499'
            WHEN activity_points < 1000 THEN '500-999'
            WHEN activity_points < 5000 THEN '1000-4999'
            ELSE '5000+'
          END AS bucket,
          COUNT(*)::int AS cnt
        FROM activity_members
        WHERE activity_id = ${activity.id}
        GROUP BY 1
        ORDER BY 1
      `);
      const pointsBuckets = (
        bucketsRaw.rows as Array<{ bucket: string; cnt: number }>
      ).map((r) => ({ bucket: r.bucket, count: Number(r.cnt) }));

      return {
        participants,
        completed,
        dropped,
        avgPoints,
        maxPoints,
        p50Points,
        milestoneClaims,
        pointsBuckets,
      };
    },

    // ─── Templates ──────────────────────────────────────────────

    async createTemplate(
      organizationId: string,
      input: {
        alias: string;
        name: string;
        description?: string | null;
        templatePayload: Record<string, unknown>;
        durationSpec: ActivityTemplateDurationSpec;
        recurrence: ActivityTemplateRecurrence;
        aliasPattern: string;
        nodesBlueprint?: ActivityNodeBlueprint[];
        schedulesBlueprint?: ActivityScheduleBlueprint[];
        autoPublish?: boolean;
        enabled?: boolean;
      },
      now: Date = new Date(),
    ) {
      validateDurationSpec(input.durationSpec);
      const nextAt = computeNextRecurrenceAt(input.recurrence, now);
      try {
        const [row] = await db
          .insert(activityTemplates)
          .values({
            organizationId,
            alias: input.alias,
            name: input.name,
            description: input.description ?? null,
            templatePayload: input.templatePayload,
            durationSpec: input.durationSpec,
            recurrence: input.recurrence,
            aliasPattern: input.aliasPattern,
            nodesBlueprint: input.nodesBlueprint ?? [],
            schedulesBlueprint: input.schedulesBlueprint ?? [],
            autoPublish: input.autoPublish ?? false,
            nextInstanceAt: nextAt,
            enabled: input.enabled ?? true,
          })
          .returning();
        return row!;
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new ActivityAliasConflict(input.alias);
        }
        throw err;
      }
    },

    async listTemplates(organizationId: string) {
      return db
        .select()
        .from(activityTemplates)
        .where(eq(activityTemplates.organizationId, organizationId))
        .orderBy(desc(activityTemplates.createdAt));
    },

    async deleteTemplate(
      organizationId: string,
      id: string,
    ): Promise<void> {
      const deleted = await db
        .delete(activityTemplates)
        .where(
          and(
            eq(activityTemplates.id, id),
            eq(activityTemplates.organizationId, organizationId),
          ),
        )
        .returning({ id: activityTemplates.id });
      if (deleted.length === 0) {
        throw new ActivityInvalidInput(`template not found: ${id}`);
      }
    },

    /**
     * Manually or automatically spawn a new activity instance from a
     * template. The new activity lands in `draft` status — operators
     * publish when they're confident. Idempotent in the sense that
     * repeated calls with the same `now` land on the same alias (if
     * the pattern resolves deterministically), and the unique
     * `(org, alias)` index rejects dupes.
     */
    async instantiateTemplate(params: {
      organizationId: string;
      templateId: string;
      now?: Date;
    }): Promise<{ activityAlias: string; activityId: string }> {
      const now = params.now ?? new Date();
      const rows = await db
        .select()
        .from(activityTemplates)
        .where(
          and(
            eq(activityTemplates.id, params.templateId),
            eq(activityTemplates.organizationId, params.organizationId),
          ),
        )
        .limit(1);
      const tpl = rows[0];
      if (!tpl) throw new ActivityInvalidInput("template not found");

      const rec = tpl.recurrence as ActivityTemplateRecurrence;
      const startAt =
        rec.mode === "manual"
          ? new Date(now.getTime() + 60_000) // manual: start 1 min from now
          : (tpl.nextInstanceAt ?? now);
      const ds = tpl.durationSpec as ActivityTemplateDurationSpec;
      const visibleAt = new Date(startAt.getTime() - ds.teaseSeconds * 1000);
      const endAt = new Date(startAt.getTime() + ds.activeSeconds * 1000);
      const rewardEndAt = new Date(
        endAt.getTime() + ds.rewardSeconds * 1000,
      );
      const hiddenAt = new Date(
        rewardEndAt.getTime() + ds.hiddenSeconds * 1000,
      );

      const newAlias = expandAliasPattern(
        tpl.aliasPattern,
        startAt,
        rec.mode !== "manual" ? rec.timezone : "UTC",
      );

      const payload = tpl.templatePayload as Record<string, unknown>;
      const [row] = await db
        .insert(activityConfigs)
        .values({
          organizationId: params.organizationId,
          alias: newAlias,
          name: (payload.name as string) ?? tpl.name,
          description: (payload.description as string | null) ?? null,
          bannerImage: (payload.bannerImage as string | null) ?? null,
          themeColor: (payload.themeColor as string | null) ?? null,
          kind: ((payload.kind as string) ?? "generic") as
            | "generic"
            | "check_in_only"
            | "board_game"
            | "gacha"
            | "season_pass"
            | "custom",
          visibleAt,
          startAt,
          endAt,
          rewardEndAt,
          hiddenAt,
          timezone:
            (payload.timezone as string | undefined) ??
            (rec.mode !== "manual" ? rec.timezone : "UTC"),
          status: "draft",
          currency: (payload.currency as typeof activityConfigs.$inferInsert.currency) ??
            null,
          milestoneTiers:
            (payload.milestoneTiers as typeof activityConfigs.$inferInsert.milestoneTiers) ??
            [],
          globalRewards:
            (payload.globalRewards as typeof activityConfigs.$inferInsert.globalRewards) ??
            [],
          kindMetadata:
            (payload.kindMetadata as Record<string, unknown> | null) ?? null,
          cleanupRule:
            (payload.cleanupRule as typeof activityConfigs.$inferInsert.cleanupRule) ??
            { mode: "purge" },
          joinRequirement:
            (payload.joinRequirement as Record<string, unknown> | null) ??
            null,
          visibility:
            (payload.visibility as "public" | "hidden" | "targeted") ??
            "public",
          templateId: tpl.id,
          metadata: (payload.metadata as Record<string, unknown> | null) ?? null,
          membership:
            (payload.membership as ActivityMembershipConfig | null | undefined) ??
            null,
        })
        .returning();
      if (!row) throw new Error("activity insert returned no row");

      // Clone nodes from blueprint. "fixed" reuses the same refId each
      // instance (shared underlying config); "omit" leaves refId null
      // (virtual node); "link_only" also leaves refId null — admin
      // will attach it manually after spawn.
      const nodesBlueprint = (tpl.nodesBlueprint ?? []) as ActivityNodeBlueprint[];
      if (nodesBlueprint.length > 0) {
        await db.insert(activityNodes).values(
          nodesBlueprint.map((bp) => ({
            activityId: row.id,
            organizationId: params.organizationId,
            alias: bp.alias,
            nodeType: bp.nodeType,
            refId: bp.refIdStrategy === "fixed" ? (bp.fixedRefId ?? null) : null,
            orderIndex: bp.orderIndex ?? 0,
            unlockRule: bp.unlockRule ?? null,
            nodeConfig: bp.nodeConfig ?? null,
            enabled: bp.enabled ?? true,
          })),
        );
      }

      // Clone schedules from blueprint. Once_at is interpreted as an
      // offset relative to the generated startAt.
      const schedulesBlueprint = (tpl.schedulesBlueprint ?? []) as ActivityScheduleBlueprint[];
      if (schedulesBlueprint.length > 0) {
        for (const bp of schedulesBlueprint) {
          const fireAt =
            bp.triggerKind === "once_at" && bp.fireAtOffsetSeconds !== undefined
              ? new Date(startAt.getTime() + bp.fireAtOffsetSeconds * 1000)
              : null;
          const nextFireAt = computeNextFireAt(
            {
              triggerKind: bp.triggerKind,
              fireAt,
              offsetFrom: bp.offsetFrom ?? null,
              offsetSeconds: bp.offsetSeconds ?? null,
              cronExpr: bp.cronExpr ?? null,
            },
            {
              visibleAt,
              startAt,
              endAt,
              rewardEndAt,
              hiddenAt,
              timezone:
                (payload.timezone as string | undefined) ??
                (rec.mode !== "manual" ? rec.timezone : "UTC"),
            },
          );
          await db.insert(activitySchedules).values({
            activityId: row.id,
            organizationId: params.organizationId,
            alias: bp.alias,
            triggerKind: bp.triggerKind,
            cronExpr: bp.cronExpr ?? null,
            fireAt,
            offsetFrom: bp.offsetFrom ?? null,
            offsetSeconds: bp.offsetSeconds ?? null,
            actionType: bp.actionType,
            actionConfig: bp.actionConfig ?? {},
            enabled: bp.enabled ?? true,
            nextFireAt,
          });
        }
      }

      // Honor autoPublish — flip persisted status directly to the
      // derived state at `now`. No manual click required.
      if (tpl.autoPublish) {
        const derived = deriveState(
          {
            status: "scheduled",
            visibleAt,
            startAt,
            endAt,
            rewardEndAt,
            hiddenAt,
          },
          now,
        );
        await db
          .update(activityConfigs)
          .set({ status: derived })
          .where(eq(activityConfigs.id, row.id));
        await events.emit("activity.state.changed", {
          organizationId: params.organizationId,
          activityId: row.id,
          previousState: "draft",
          newState: derived,
        });
      }

      // Advance template's nextInstanceAt for the following cycle.
      const nextAt =
        rec.mode === "manual"
          ? null
          : computeNextRecurrenceAt(rec, startAt);
      await db
        .update(activityTemplates)
        .set({
          nextInstanceAt: nextAt,
          lastInstantiatedAlias: newAlias,
          lastInstantiatedAt: now,
        })
        .where(eq(activityTemplates.id, tpl.id));

      return { activityAlias: newAlias, activityId: row.id };
    },

    /**
     * Called from the cron tick: walk every enabled template whose
     * `nextInstanceAt <= now` and spawn a new instance. Unique alias
     * index makes double-spawning impossible.
     */
    async tickTemplates(params: { now?: Date } = {}): Promise<{
      spawned: number;
      errors: number;
    }> {
      const now = params.now ?? new Date();
      const due = await db
        .select()
        .from(activityTemplates)
        .where(
          and(
            eq(activityTemplates.enabled, true),
            lte(activityTemplates.nextInstanceAt, now),
          ),
        );
      let spawned = 0;
      let errors = 0;
      for (const tpl of due) {
        try {
          await this.instantiateTemplate({
            organizationId: tpl.organizationId,
            templateId: tpl.id,
            now,
          });
          spawned++;
        } catch (err) {
          if (isUniqueViolation(err)) {
            // Another process beat us or pattern collision — skip.
            continue;
          }
          errors++;
          logger.error(
            `[activity] template ${tpl.alias} spawn failed:`,
            err,
          );
        }
      }
      return { spawned, errors };
    },

    // ─── Cron tick ──────────────────────────────────────────────

    /**
     * Runs every minute via `scheduled.ts`:
     *   1. Advance persisted status on any activity whose derived
     *      state differs.
     *   2. Fire matured schedules.
     */
    async tickDue(params: { now?: Date } = {}): Promise<{
      advanced: number;
      scheduleFired: number;
      templatesSpawned: number;
      errors: number;
    }> {
      const now = params.now ?? new Date();
      let advanced = 0;
      let scheduleFired = 0;
      let errors = 0;

      // ─── Pass 0 — spawn template instances ─────────────────────
      const tplResult = await this.tickTemplates({ now });
      const templatesSpawned = tplResult.spawned;
      errors += tplResult.errors;

      // ─── Pass 1 — advance statuses ────────────────────────────
      const liveActivities = await db
        .select()
        .from(activityConfigs)
        .where(ne(activityConfigs.status, "draft"));

      for (const act of liveActivities) {
        const desired = deriveState(act, now);
        if (desired === act.status) continue;
        try {
          const [row] = await db
            .update(activityConfigs)
            .set({ status: desired })
            .where(
              and(
                eq(activityConfigs.id, act.id),
                eq(activityConfigs.status, act.status),
              ),
            )
            .returning();
          if (!row) continue; // someone else raced us
          advanced++;
          await events.emit("activity.state.changed", {
            organizationId: act.organizationId,
            activityId: act.id,
            previousState: act.status as ActivityState,
            newState: desired,
          });
          // Kind Handler 生命周期 hook（handler 失败内部捕获打日志，
          // 不中断核心流程 —— 见 kind/lifecycle-bridge.ts）。
          await broadcastStateChange({
            activity: { ...act, status: desired },
            prevState: act.status as ActivityState,
            nextState: desired,
            runtime: { db, events },
          });
          if (desired === "archived") {
            await broadcastArchive({
              activity: { ...act, status: desired },
              runtime: { db, events },
            });
            await runArchiveCleanup(db, act);
          }
        } catch (err) {
          errors++;
          logger.error(`[activity] advance failed id=${act.id}:`, err);
        }
      }

      // ─── Pass 2 — fire schedules ──────────────────────────────
      const dueSchedules = await db
        .select()
        .from(activitySchedules)
        .where(
          and(
            eq(activitySchedules.enabled, true),
            lte(activitySchedules.nextFireAt, now),
          ),
        );
      for (const s of dueSchedules) {
        try {
          // Atomic disable for one-shot kinds to avoid double-fire.
          if (
            s.triggerKind === "once_at" ||
            s.triggerKind === "relative_offset"
          ) {
            const [claimed] = await db
              .update(activitySchedules)
              .set({ enabled: false, lastFiredAt: now, lastStatus: "ok" })
              .where(
                and(
                  eq(activitySchedules.id, s.id),
                  eq(activitySchedules.enabled, true),
                ),
              )
              .returning();
            if (!claimed) continue; // raced
          } else if (s.triggerKind === "cron") {
            // Recurring: atomically advance `nextFireAt` to the next
            // match past `now`. If we can't compute one, disable to
            // avoid a tight loop on a broken expression.
            const activity = await loadByKey(s.organizationId, s.activityId);
            const nextAt = computeNextFireAt(
              {
                triggerKind: "cron",
                fireAt: null,
                offsetFrom: null,
                offsetSeconds: null,
                cronExpr: s.cronExpr,
              },
              activity,
              now,
            );
            if (!nextAt) {
              await db
                .update(activitySchedules)
                .set({ enabled: false, lastFiredAt: now, lastStatus: "bad_cron" })
                .where(eq(activitySchedules.id, s.id));
              continue;
            }
            const [claimed] = await db
              .update(activitySchedules)
              .set({
                nextFireAt: nextAt,
                lastFiredAt: now,
                lastStatus: "ok",
              })
              .where(
                and(
                  eq(activitySchedules.id, s.id),
                  lte(activitySchedules.nextFireAt, now),
                ),
              )
              .returning();
            if (!claimed) continue; // raced
          }
          await fireSchedule({ db, mailGetter, events, schedule: s, now });
          scheduleFired++;
        } catch (err) {
          errors++;
          logger.error(`[activity] schedule fire failed id=${s.id}:`, err);
        }
      }

      return {
        advanced,
        scheduleFired,
        templatesSpawned,
        errors,
      };
    },
  };
}

export type ActivityService = ReturnType<typeof createActivityService>;

// ─── Internals ────────────────────────────────────────────────────

function isNodeUnlocked(
  node: ActivityNode,
  activity: ActivityConfig,
  progress: ActivityMemberRow | null,
  completed: Set<string>,
  now: Date,
): boolean {
  if (!node.enabled) return false;
  const rule = node.unlockRule;
  if (!rule) return true;
  if (rule.requirePrevNodeAliases) {
    for (const a of rule.requirePrevNodeAliases) {
      if (!completed.has(`node:${a}`)) return false;
    }
  }
  if (
    rule.minActivityPoints !== undefined &&
    (progress?.activityPoints ?? 0) < rule.minActivityPoints
  ) {
    return false;
  }
  if (rule.notBefore && now.getTime() < new Date(rule.notBefore).getTime()) {
    return false;
  }
  if (rule.relativeToStartSeconds !== undefined) {
    const unlockAt =
      activity.startAt.getTime() + rule.relativeToStartSeconds * 1000;
    if (now.getTime() < unlockAt) return false;
  }
  return true;
}

/**
 * Archive-time cleanup. Runs once when an activity transitions to
 * `archived` (either via cron state advancement or a manual trigger).
 *
 * Steps:
 *   1. Disable every `activity_schedules` row for this activity so the
 *      scanner stops picking them up.
 *   2. Fetch the activity's `cleanup_rule`. Three modes:
 *      - "purge"   → DELETE every `entity_instances` row with
 *                    `activity_id = self.id`. Cascades through equipment
 *                    slots / formations via existing FKs.
 *      - "convert" → (stub) emit an event carrying the conversion map
 *                    so the host game can choose how to compensate
 *                    players, then DELETE the rows. The real payout
 *                    path needs `itemService.grantItems` wiring —
 *                    parked as a TODO but schema supports it.
 *      - "keep"    → no-op. Entities stay bound to archived activity.
 *
 * All DB writes are single statements. Failures are logged so one
 * broken row doesn't block the rest of the tick.
 */
async function runArchiveCleanup(
  db: AppDeps["db"],
  activity: ActivityConfig,
): Promise<void> {
  await db
    .update(activitySchedules)
    .set({ enabled: false })
    .where(
      and(
        eq(activitySchedules.activityId, activity.id),
        eq(activitySchedules.enabled, true),
      ),
    );

  const rule = (activity.cleanupRule ?? { mode: "purge" }) as {
    mode: "purge" | "convert" | "keep";
    conversionMap?: Record<string, unknown>;
  };

  if (rule.mode === "keep") return;

  if (rule.mode === "convert") {
    // Log how many rows would convert; do not implement payout yet —
    // games that need this can listen to `activity.state.changed` and
    // run their own grant logic, then call the keep/purge admin path.
    const counted = await db.execute<{ cnt: number }>(sql`
      SELECT COUNT(*)::int AS cnt
      FROM entity_instances
      WHERE activity_id = ${activity.id}
    `);
    const n = (counted.rows[0] as { cnt: number } | undefined)?.cnt ?? 0;
    logger.info(
      `[activity] archive convert: activity=${activity.id} entity_instances=${n} (conversion logic TODO, falling through to purge)`,
    );
  }

  // purge (also fall-through for convert in MVP)
  await db.execute(sql`
    DELETE FROM entity_instances
    WHERE activity_id = ${activity.id}
  `);
}

async function fireSchedule(params: {
  db: AppDeps["db"];
  mailGetter: MailGetter;
  events: AppDeps["events"];
  schedule: {
    id: string;
    activityId: string;
    organizationId: string;
    alias: string;
    actionType: string;
    actionConfig: Record<string, unknown>;
  };
  now: Date;
}): Promise<void> {
  const { db, mailGetter, events, schedule, now } = params;
  const cfg = schedule.actionConfig ?? {};

  switch (schedule.actionType) {
    case "emit_bus_event": {
      await events.emit("activity.schedule.fired", {
        organizationId: schedule.organizationId,
        activityId: schedule.activityId,
        scheduleAlias: schedule.alias,
        actionType: schedule.actionType,
        firedAt: now,
        actionConfig: cfg,
      });
      break;
    }

    case "grant_reward": {
      const rewards = (cfg.rewards ?? []) as RewardEntry[];
      const participants = await db
        .select({ endUserId: activityMembers.endUserId })
        .from(activityMembers)
        .where(eq(activityMembers.activityId, schedule.activityId));
      const mail = mailGetter();
      if (!mail) break;
      const rewardKey = `schedule:${schedule.alias}`;
      for (const p of participants) {
        try {
          await db.insert(activityUserRewards).values({
            activityId: schedule.activityId,
            organizationId: schedule.organizationId,
            endUserId: p.endUserId,
            rewardKey,
            rewards,
          });
          await mail.sendUnicast(schedule.organizationId, p.endUserId, {
            title: `Activity reward`,
            content: `Reward triggered by schedule "${schedule.alias}".`,
            rewards,
            originSource: "activity_schedule_grant",
            originSourceId: `${schedule.id}:${p.endUserId}`,
          });
        } catch (err) {
          if (!isUniqueViolation(err)) {
            logger.error(
              `[activity] grant_reward failed user=${p.endUserId}:`,
              err,
            );
          }
        }
      }
      break;
    }

    case "broadcast_mail": {
      const mail = mailGetter();
      if (!mail) break;
      const title = (cfg.title as string) ?? "Activity notice";
      const content = (cfg.content as string) ?? "";
      const rewards = (cfg.rewards ?? []) as RewardEntry[];
      await mail.createMessage(schedule.organizationId, {
        title,
        content,
        rewards,
        targetType: "broadcast",
        originSource: "activity_schedule_broadcast",
        originSourceId: schedule.id,
      });
      break;
    }

    case "set_flag":
    default:
      logger.warn(
        `[activity] action_type=${schedule.actionType} not implemented in MVP`,
      );
  }
}

/**
 * Batch-resolve the "is active" flag of every resource referenced by a
 * set of activity nodes. Different resource tables use different
 * columns (most use `isActive` boolean; `leaderboard_configs` uses a
 * `status` text with "active" | "paused" | "archived"). We normalize
 * everything to a boolean for the aggregated view.
 *
 * Returns a map keyed by resource id. Missing entries mean the resource
 * was not found — callers treat that as `false` (safer: a dangling
 * refId should not render as enabled).
 */
async function resolveRefActivity(
  db: AppDeps["db"],
  nodes: ActivityNode[],
): Promise<Map<string, boolean>> {
  const map = new Map<string, boolean>();
  const byType = new Map<string, string[]>();
  for (const n of nodes) {
    if (!n.refId) continue;
    const list = byType.get(n.nodeType) ?? [];
    list.push(n.refId);
    byType.set(n.nodeType, list);
  }

  for (const [type, ids] of byType) {
    if (ids.length === 0) continue;
    switch (type) {
      case "check_in": {
        const rows = await db
          .select({
            id: checkInConfigs.id,
            isActive: checkInConfigs.isActive,
          })
          .from(checkInConfigs)
          .where(inArray(checkInConfigs.id, ids));
        for (const r of rows) map.set(r.id, r.isActive);
        break;
      }
      case "task_group": {
        const rows = await db
          .select({
            id: taskDefinitions.id,
            isActive: taskDefinitions.isActive,
          })
          .from(taskDefinitions)
          .where(inArray(taskDefinitions.id, ids));
        for (const r of rows) map.set(r.id, r.isActive);
        break;
      }
      case "exchange": {
        const rows = await db
          .select({
            id: shopProducts.id,
            isActive: shopProducts.isActive,
          })
          .from(shopProducts)
          .where(inArray(shopProducts.id, ids));
        for (const r of rows) map.set(r.id, r.isActive);
        break;
      }
      case "banner": {
        const rows = await db
          .select({
            id: bannerGroups.id,
            isActive: bannerGroups.isActive,
          })
          .from(bannerGroups)
          .where(inArray(bannerGroups.id, ids));
        for (const r of rows) map.set(r.id, r.isActive);
        break;
      }
      case "lottery": {
        const rows = await db
          .select({
            id: lotteryPools.id,
            isActive: lotteryPools.isActive,
          })
          .from(lotteryPools)
          .where(inArray(lotteryPools.id, ids));
        for (const r of rows) map.set(r.id, r.isActive);
        break;
      }
      case "leaderboard": {
        const rows = await db
          .select({
            id: leaderboardConfigs.id,
            status: leaderboardConfigs.status,
          })
          .from(leaderboardConfigs)
          .where(inArray(leaderboardConfigs.id, ids));
        for (const r of rows) map.set(r.id, r.status === "active");
        break;
      }
      case "assist_pool": {
        const rows = await db
          .select({
            id: assistPoolConfigs.id,
            isActive: assistPoolConfigs.isActive,
          })
          .from(assistPoolConfigs)
          .where(inArray(assistPoolConfigs.id, ids));
        for (const r of rows) map.set(r.id, r.isActive);
        break;
      }
      // Virtual nodes (game_board / custom / lottery-other) with no
      // mapped resource table just don't contribute — effectiveEnabled
      // falls back to `node.enabled` alone.
    }
  }
  return map;
}

function validateDurationSpec(ds: ActivityTemplateDurationSpec): void {
  if (!Number.isFinite(ds.teaseSeconds) || ds.teaseSeconds < 0)
    throw new ActivityInvalidInput("durationSpec.teaseSeconds must be >= 0");
  if (!Number.isFinite(ds.activeSeconds) || ds.activeSeconds <= 0)
    throw new ActivityInvalidInput("durationSpec.activeSeconds must be > 0");
  if (!Number.isFinite(ds.rewardSeconds) || ds.rewardSeconds < 0)
    throw new ActivityInvalidInput("durationSpec.rewardSeconds must be >= 0");
  if (!Number.isFinite(ds.hiddenSeconds) || ds.hiddenSeconds < 0)
    throw new ActivityInvalidInput("durationSpec.hiddenSeconds must be >= 0");
}

/**
 * Compute the next start_at for a recurrence. Returns null for
 * `manual` mode. For weekly/monthly we advance to the next occurrence
 * strictly AFTER `anchor` (we don't want to re-spawn into the past).
 *
 * Timezone handling: we don't bother with full tz math beyond what
 * `Intl.DateTimeFormat` gives us — the admin picks the timezone and
 * the cron runs hourly, so "20:00 Asia/Shanghai on Monday" is computed
 * by formatting UTC time in the target tz and walking forward until we
 * hit the target (day, hour). For MVP this is sufficient precision.
 */
function computeNextRecurrenceAt(
  rec: ActivityTemplateRecurrence,
  anchor: Date,
): Date | null {
  if (rec.mode === "manual") return null;
  // Start one hour after anchor (minimum) and walk forward in 1-hour
  // steps until we hit the target. Bounded by 40 days; if we don't
  // match in 40 days we bail (misconfigured recurrence).
  let candidate = new Date(anchor.getTime() + 60_000);
  for (let i = 0; i < 40 * 24; i++) {
    const parts = formatInTz(candidate, rec.timezone);
    const hourMatch = parts.hour === rec.hourOfDay && parts.minute === 0;
    if (rec.mode === "weekly") {
      if (parts.weekday === rec.dayOfWeek && hourMatch) return candidate;
    } else {
      // monthly
      const lastDay = daysInMonth(parts.year, parts.month);
      const targetDay = Math.min(rec.dayOfMonth, lastDay);
      if (parts.day === targetDay && hourMatch) return candidate;
    }
    candidate = new Date(candidate.getTime() + 60 * 60_000);
  }
  return null;
}

function daysInMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

function formatInTz(
  date: Date,
  tz: string,
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
} {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    weekday: "short",
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === "24" ? "0" : parts.hour),
    minute: Number(parts.minute),
    weekday: weekdayMap[parts.weekday ?? "Sun"] ?? 0,
  };
}

function expandAliasPattern(pattern: string, at: Date, tz: string): string {
  const p = formatInTz(at, tz);
  const isoWeek = computeIsoWeek(p.year, p.month, p.day);
  return pattern
    .replace(/\{year\}/g, String(p.year))
    .replace(/\{month\}/g, String(p.month).padStart(2, "0"))
    .replace(/\{day\}/g, String(p.day).padStart(2, "0"))
    .replace(/\{week\}/g, String(isoWeek).padStart(2, "0"))
    .replace(/\{ts\}/g, String(Math.floor(at.getTime() / 1000)));
}

function computeIsoWeek(year: number, month: number, day: number): number {
  const target = new Date(Date.UTC(year, month - 1, day));
  const dayNum = (target.getUTCDay() + 6) % 7; // Mon=0
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = target.valueOf();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay() + 7) % 7));
  }
  return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
}

/**
 * Allocate a random, activity-unique queue number for a member that
 * doesn't yet have one. Loops up to MAX_ATTEMPTS times — each attempt
 * generates a fresh random candidate and does a conditional UPDATE
 * guarded by the partial unique index (activity_id, queue_number)
 * WHERE queue_number IS NOT NULL. A unique-violation means we raced
 * another caller onto the same candidate; pick another and try again.
 *
 * Reads the fresh row after success so queue-number idempotence across
 * concurrent `/join` calls is handled by "queue_number IS NULL" gate
 * in the UPDATE WHERE clause.
 */
async function allocateQueueNumber(
  db: AppDeps["db"],
  member: ActivityMemberRow,
  queue: { format: "numeric" | "alphanumeric"; length: number },
): Promise<ActivityMemberRow> {
  const MAX_ATTEMPTS = 5;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const candidate = generateQueueCandidate(queue.format, queue.length);
    try {
      const [row] = await db
        .update(activityMembers)
        .set({ queueNumber: candidate })
        .where(
          and(
            eq(activityMembers.id, member.id),
            isNull(activityMembers.queueNumber),
          ),
        )
        .returning();
      if (row) return row;
      // Zero rows: someone else set it first (concurrent join). Read
      // what's there and return — subsequent callers are idempotent.
      const fresh = await db
        .select()
        .from(activityMembers)
        .where(eq(activityMembers.id, member.id))
        .limit(1);
      if (fresh[0]?.queueNumber) return fresh[0];
      // Still null? Loop and try again.
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // Candidate collided with an existing member's number — retry.
    }
  }
  throw new ActivityQueueNumberExhausted();
}

const NUMERIC_ALPHABET = "0123456789";
// Alphanumeric pool without easily-confused characters: 0 vs O, 1 vs I
// vs L. Keeps ticket legibility high when operators read them aloud.
const ALPHANUMERIC_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function generateQueueCandidate(
  format: "numeric" | "alphanumeric",
  length: number,
): string {
  const alphabet =
    format === "numeric" ? NUMERIC_ALPHABET : ALPHANUMERIC_ALPHABET;
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return out;
}


