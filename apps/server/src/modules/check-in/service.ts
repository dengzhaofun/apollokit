/**
 * Check-in service — protocol-agnostic business logic.
 *
 * This file MUST NOT import Hono, @hono/zod-openapi, or any HTTP concepts.
 * Its only bridge to the outside world is the typed `AppDeps` object. Other
 * protocols (future cron jobs, MCP servers, internal RPC) re-use this same
 * factory by passing their own `deps` (or the production singleton).
 *
 * ---------------------------------------------------------------------
 * Why this module uses conditional upsert instead of a transaction
 * ---------------------------------------------------------------------
 *
 * Hot-path check-in writes complete in a single round-trip; the classic
 * "SELECT state FOR UPDATE → compute next → UPDATE" pattern would pin a
 * Hyperdrive-pooled connection across multiple awaits. We express the
 * mutation as a single atomic SQL statement using:
 *
 *   INSERT INTO check_in_user_states (...)
 *   VALUES (...)   -- values computed in-memory from the last read
 *   ON CONFLICT (config_id, end_user_id) DO UPDATE SET ...
 *   WHERE check_in_user_states.last_check_in_date IS DISTINCT FROM EXCLUDED.last_check_in_date
 *   RETURNING ..., (xmax = 0) AS inserted;
 *
 * Concurrency analysis:
 *   - Two concurrent `checkIn` calls for the same (config, endUser, day)
 *     both compute `today = YYYY-MM-DD` and race to the upsert.
 *   - Postgres serializes them via row-level lock on conflict. Whichever
 *     commits first changes `last_check_in_date` to today; the loser's
 *     `WHERE last_check_in_date IS DISTINCT FROM EXCLUDED.last_check_in_date`
 *     evaluates false, so RETURNING yields zero rows. The loser then
 *     re-reads the row and reports `alreadyCheckedIn: true`.
 *   - If the read in step 3 saw stale data (e.g., another request signed in
 *     on the same day after we read but before we wrote), the worst outcome
 *     is a no-op upsert — no corruption.
 *
 * `(xmax = 0) AS inserted` distinguishes a fresh insert from an update,
 * which we use to populate `firstCheckInAt` on first signing without a
 * separate statement.
 *
 * ---------------------------------------------------------------------
 * Event history intentionally absent
 * ---------------------------------------------------------------------
 *
 * The per-check-in event log (who signed, when) will be owned by a future
 * unified behavior-log subsystem. This module only tracks aggregate state.
 * When that subsystem lands, extend `checkIn()` to emit a single behavior
 * record at the end — nothing else needs to change.
 */

import { and, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";

import type { AppDeps } from "../../deps";
import { isUniqueViolation } from "../../lib/db-errors";
import { looksLikeId } from "../../lib/key-resolver";
import {
  buildPage,
  buildPageBy,
  clampLimit,
  cursorWhere,
  type Page,
  type PageParams,
} from "../../lib/pagination";
import type { RewardEntry } from "../../lib/rewards";
import {
  checkInConfigs,
  checkInRewards,
  checkInUserStates,
} from "../../schema/check-in";
import { assertActivityWritable } from "../activity/gate";
import type { ItemService } from "../item/service";
import {
  CheckInAliasConflict,
  CheckInConfigInactive,
  CheckInConfigNotFound,
  CheckInInvalidInput,
} from "./errors";
import { cycleKeyFor, isConsecutiveDay, toNaturalDate } from "./time";
import type {
  CheckInConfig,
  CheckInResult,
  CheckInUserState,
  CheckInUserStateView,
  ResetMode,
} from "./types";
import { RESET_MODES } from "./types";
import type { CreateConfigInput, UpdateConfigInput } from "./validators";

// `events` optional to keep `createCheckInService({ db })` test sites
// compiling. Production wiring hands it in via `deps`.
type CheckInDeps = Pick<AppDeps, "db"> & Partial<Pick<AppDeps, "events">>;

// Extend the in-runtime event-bus type map with check-in-domain events.
// Task / achievement systems will subscribe to this downstream for
// "check in N days in a row" style progression.
declare module "../../lib/event-bus" {
  interface EventMap {
    "check_in.completed": {
      organizationId: string;
      endUserId: string;
      configId: string;
      cycleKey: string;
      dateKey: string;
      streak: number;
      cycleDays: number;
      justCompletedCycle: boolean;
      rewards: RewardEntry[] | null;
    };
  }
}

function assertResetMode(mode: string): asserts mode is ResetMode {
  if (!(RESET_MODES as readonly string[]).includes(mode)) {
    throw new CheckInInvalidInput(`invalid resetMode: ${mode}`);
  }
}

function validateTargetForMode(target: number | null | undefined, mode: ResetMode) {
  if (target === null || target === undefined) return;
  if (!Number.isInteger(target) || target <= 0) {
    throw new CheckInInvalidInput("target must be a positive integer");
  }
  if (mode === "week" && target > 7) {
    throw new CheckInInvalidInput("target for resetMode='week' must be <= 7");
  }
  if (mode === "month" && target > 31) {
    throw new CheckInInvalidInput("target for resetMode='month' must be <= 31");
  }
}

/**
 * Reward `dayNumber` must fit inside the config's cycle length:
 *   - week  → 1..7
 *   - month → 1..31
 *   - none + target → 1..target
 *   - none + null target → any positive integer (free-form schedule)
 *
 * The zod schema can only see one row at a time, so it can't enforce
 * this; the service layer is the single source of truth. Throwing
 * `CheckInInvalidInput` keeps the HTTP envelope at 400 and lets clients
 * surface the specific message.
 */
function validateDayNumberForConfig(
  config: CheckInConfig,
  dayNumber: number,
) {
  if (!Number.isInteger(dayNumber) || dayNumber < 1) {
    throw new CheckInInvalidInput("dayNumber must be a positive integer");
  }
  if (config.resetMode === "week" && dayNumber > 7) {
    throw new CheckInInvalidInput(
      "dayNumber must be 1..7 for resetMode='week'",
    );
  }
  if (config.resetMode === "month" && dayNumber > 31) {
    throw new CheckInInvalidInput(
      "dayNumber must be 1..31 for resetMode='month'",
    );
  }
  if (
    config.resetMode === "none" &&
    config.target !== null &&
    dayNumber > config.target
  ) {
    throw new CheckInInvalidInput(
      `dayNumber must be 1..${config.target} for this config's target`,
    );
  }
}

function computeCompletion(
  target: number | null,
  currentCycleDays: number,
): { isCompleted: boolean; remaining: number | null } {
  if (target === null) return { isCompleted: false, remaining: null };
  const remaining = Math.max(0, target - currentCycleDays);
  return { isCompleted: currentCycleDays >= target, remaining };
}

export function createCheckInService(d: CheckInDeps, itemSvc?: ItemService) {
  const { db, events } = d;

  async function loadConfigByKey(
    organizationId: string,
    key: string,
  ): Promise<CheckInConfig> {
    const where = looksLikeId(key)
      ? and(
          eq(checkInConfigs.organizationId, organizationId),
          eq(checkInConfigs.id, key),
        )
      : and(
          eq(checkInConfigs.organizationId, organizationId),
          eq(checkInConfigs.alias, key),
        );

    const rows = await db.select().from(checkInConfigs).where(where).limit(1);
    const row = rows[0];
    if (!row) throw new CheckInConfigNotFound(key);
    return row;
  }

  return {
    async createConfig(
      organizationId: string,
      input: CreateConfigInput,
    ): Promise<CheckInConfig> {
      assertResetMode(input.resetMode);
      validateTargetForMode(input.target ?? null, input.resetMode);

      try {
        const [row] = await db
          .insert(checkInConfigs)
          .values({
            organizationId,
            name: input.name,
            alias: input.alias ?? null,
            description: input.description ?? null,
            resetMode: input.resetMode,
            weekStartsOn: input.weekStartsOn ?? 1,
            target: input.target ?? null,
            timezone: input.timezone ?? "UTC",
            isActive: input.isActive ?? true,
            activityId: input.activityId ?? null,
            activityNodeId: input.activityNodeId ?? null,
            metadata: input.metadata ?? null,
          })
          .returning();
        if (!row) throw new Error("insert returned no row");
        return row;
      } catch (err) {
        // Partial unique index on (organization_id, alias) where alias is not null.
        // Postgres raises SQLSTATE 23505 on conflict — we surface the friendlier
        // typed error instead of letting a 500 leak through.
        if (isUniqueViolation(err) && input.alias) {
          throw new CheckInAliasConflict(input.alias);
        }
        throw err;
      }
    },

    async updateConfig(
      organizationId: string,
      id: string,
      patch: UpdateConfigInput,
    ): Promise<CheckInConfig> {
      // Load first so we can validate target against the existing resetMode
      // (which is immutable post-creation — changing reset semantics
      // mid-flight would corrupt cycle keys for every existing user).
      const existing = await loadConfigByKey(organizationId, id);
      if (patch.target !== undefined) {
        validateTargetForMode(patch.target, existing.resetMode as ResetMode);
      }

      const updateValues: Partial<typeof checkInConfigs.$inferInsert> = {};
      if (patch.name !== undefined) updateValues.name = patch.name;
      if (patch.alias !== undefined) updateValues.alias = patch.alias;
      if (patch.description !== undefined)
        updateValues.description = patch.description;
      if (patch.weekStartsOn !== undefined)
        updateValues.weekStartsOn = patch.weekStartsOn;
      if (patch.target !== undefined) updateValues.target = patch.target;
      if (patch.timezone !== undefined) updateValues.timezone = patch.timezone;
      if (patch.isActive !== undefined) updateValues.isActive = patch.isActive;
      if (patch.activityId !== undefined)
        updateValues.activityId = patch.activityId;
      if (patch.activityNodeId !== undefined)
        updateValues.activityNodeId = patch.activityNodeId;
      if (patch.metadata !== undefined) updateValues.metadata = patch.metadata;

      if (Object.keys(updateValues).length === 0) return existing;

      try {
        const [row] = await db
          .update(checkInConfigs)
          .set(updateValues)
          .where(
            and(
              eq(checkInConfigs.id, existing.id),
              eq(checkInConfigs.organizationId, organizationId),
            ),
          )
          .returning();
        if (!row) throw new CheckInConfigNotFound(id);
        return row;
      } catch (err) {
        if (isUniqueViolation(err) && patch.alias) {
          throw new CheckInAliasConflict(patch.alias);
        }
        throw err;
      }
    },

    async deleteConfig(organizationId: string, id: string): Promise<void> {
      const deleted = await db
        .delete(checkInConfigs)
        .where(
          and(
            eq(checkInConfigs.id, id),
            eq(checkInConfigs.organizationId, organizationId),
          ),
        )
        .returning({ id: checkInConfigs.id });
      if (deleted.length === 0) throw new CheckInConfigNotFound(id);
    },

    /**
     * List check-in configs. By default, activity-scoped configs (with
     * `activityId IS NOT NULL`) are excluded so the "standalone
     * check-ins" admin page isn't polluted by per-event one-offs. Pass
     * `{ includeActivity: true }` to show everything, or
     * `{ activityId: "<uuid>" }` to list configs for a specific activity.
     */
    async listConfigs(
      organizationId: string,
      filter: PageParams & { includeActivity?: boolean; activityId?: string } = {},
    ): Promise<Page<CheckInConfig>> {
      const limit = clampLimit(filter.limit);
      const conds: SQL[] = [eq(checkInConfigs.organizationId, organizationId)];
      if (filter.activityId) {
        conds.push(eq(checkInConfigs.activityId, filter.activityId));
      } else if (!filter.includeActivity) {
        conds.push(isNull(checkInConfigs.activityId));
      }
      const seek = cursorWhere(filter.cursor, checkInConfigs.createdAt, checkInConfigs.id);
      if (seek) conds.push(seek);
      if (filter.q) {
        const pat = `%${filter.q}%`;
        const search = or(ilike(checkInConfigs.name, pat), ilike(checkInConfigs.alias, pat));
        if (search) conds.push(search);
      }
      const rows = await db
        .select()
        .from(checkInConfigs)
        .where(and(...conds))
        .orderBy(desc(checkInConfigs.createdAt), desc(checkInConfigs.id))
        .limit(limit + 1);
      return buildPage(rows, limit);
    },

    async getConfig(
      organizationId: string,
      idOrAlias: string,
    ): Promise<CheckInConfig> {
      return loadConfigByKey(organizationId, idOrAlias);
    },

    async listUserStates(params: {
      organizationId: string;
      configKey: string;
    } & PageParams): Promise<Page<CheckInUserState>> {
      const config = await loadConfigByKey(
        params.organizationId,
        params.configKey,
      );
      const limit = clampLimit(params.limit);
      const conds: SQL[] = [eq(checkInUserStates.configId, config.id)];
      const seek = cursorWhere(
        params.cursor,
        checkInUserStates.createdAt,
        checkInUserStates.endUserId,
      );
      if (seek) conds.push(seek);
      if (params.q) {
        conds.push(ilike(checkInUserStates.endUserId, `%${params.q}%`));
      }
      const rows = await db
        .select()
        .from(checkInUserStates)
        .where(and(...conds))
        .orderBy(desc(checkInUserStates.createdAt), desc(checkInUserStates.endUserId))
        .limit(limit + 1);
      return buildPageBy(rows, limit, (r) => ({
        createdAt: r.createdAt,
        id: r.endUserId,
      }));
    },

    async getUserState(params: {
      organizationId: string;
      configKey: string;
      endUserId: string;
    }): Promise<CheckInUserStateView> {
      const config = await loadConfigByKey(
        params.organizationId,
        params.configKey,
      );
      const rows = await db
        .select()
        .from(checkInUserStates)
        .where(
          and(
            eq(checkInUserStates.configId, config.id),
            eq(checkInUserStates.endUserId, params.endUserId),
          ),
        )
        .limit(1);

      const state: CheckInUserState =
        rows[0] ??
        ({
          configId: config.id,
          endUserId: params.endUserId,
          organizationId: params.organizationId,
          totalDays: 0,
          currentStreak: 0,
          longestStreak: 0,
          currentCycleKey: null,
          currentCycleDays: 0,
          lastCheckInDate: null,
          firstCheckInAt: null,
          lastCheckInAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        } satisfies CheckInUserState);

      const completion = computeCompletion(config.target, state.currentCycleDays);
      return {
        state,
        target: config.target,
        isCompleted: completion.isCompleted,
        remaining: completion.remaining,
      };
    },

    async checkIn(params: {
      organizationId: string;
      configKey: string;
      endUserId: string;
      now?: Date;
    }): Promise<CheckInResult> {
      const config = await loadConfigByKey(
        params.organizationId,
        params.configKey,
      );
      if (!config.isActive) throw new CheckInConfigInactive(params.configKey);

      const resetMode = config.resetMode as ResetMode;
      assertResetMode(resetMode);

      const now = params.now ?? new Date();

      // If the config is bound to an activity, the activity must be in
      // its writable phase (active). reset_mode and the activity window
      // are independent dimensions: reset_mode still drives streak
      // resets within the window. The inline daily-reward grant below
      // is also gated by this single check — no separate claimable
      // gate needed until a deferred-claim endpoint is added.
      if (config.activityId) {
        await assertActivityWritable(db, config.activityId, now);
      }
      const today = toNaturalDate(now, config.timezone);
      const newCycleKey = cycleKeyFor(today, resetMode, config.weekStartsOn);

      // Step 3: read current state (may not exist on first check-in).
      const existingRows = await db
        .select()
        .from(checkInUserStates)
        .where(
          and(
            eq(checkInUserStates.configId, config.id),
            eq(checkInUserStates.endUserId, params.endUserId),
          ),
        )
        .limit(1);
      const existing = existingRows[0] ?? null;

      // Early return: already checked in today.
      if (existing && existing.lastCheckInDate === today) {
        const completion = computeCompletion(
          config.target,
          existing.currentCycleDays,
        );
        return {
          alreadyCheckedIn: true,
          justCompleted: false,
          state: existing,
          target: config.target,
          isCompleted: completion.isCompleted,
          remaining: completion.remaining,
        };
      }

      // Compute next state in memory from (existing, today, newCycleKey).
      let nextTotal: number;
      let nextStreak: number;
      let nextLongest: number;
      let nextCycleDays: number;

      if (!existing) {
        nextTotal = 1;
        nextStreak = 1;
        nextLongest = 1;
        nextCycleDays = 1;
      } else {
        const sameCycle = existing.currentCycleKey === newCycleKey;
        const consecutive =
          existing.lastCheckInDate !== null &&
          isConsecutiveDay(existing.lastCheckInDate, today);

        nextTotal = existing.totalDays + 1;
        // Streak continues only when both (a) the previous check-in is
        // yesterday in wall-clock, and (b) we're still in the same reset
        // cycle. Crossing a week/month boundary resets the streak to 1
        // even if the previous check-in was literally yesterday, because
        // the business definition of "streak" is per-cycle.
        nextStreak = consecutive && sameCycle ? existing.currentStreak + 1 : 1;
        nextLongest = Math.max(existing.longestStreak, nextStreak);
        nextCycleDays = sameCycle ? existing.currentCycleDays + 1 : 1;
      }

      const prevCompletion = existing
        ? computeCompletion(config.target, existing.currentCycleDays)
        : { isCompleted: false, remaining: config.target };
      const nextCompletion = computeCompletion(config.target, nextCycleDays);

      // Step 5: atomic upsert. See file-header note for concurrency proof.
      //
      // `firstCheckInAt` is intentionally present in VALUES but absent from
      // the DO UPDATE SET list — on first insert it gets set to `now`, on
      // subsequent updates Postgres keeps the existing value. This lets us
      // do the whole write in one round-trip without a separate backfill.
      //
      // The `setWhere` clause is the concurrency gate: when two concurrent
      // callers race on the same (config, user, day), whichever commits
      // first flips `last_check_in_date` to today; the loser's `setWhere`
      // evaluates false so `RETURNING` yields zero rows, and we route that
      // caller to the "already checked in" branch via a re-read.
      const upserted = await db
        .insert(checkInUserStates)
        .values({
          configId: config.id,
          endUserId: params.endUserId,
          organizationId: params.organizationId,
          totalDays: nextTotal,
          currentStreak: nextStreak,
          longestStreak: nextLongest,
          currentCycleKey: newCycleKey,
          currentCycleDays: nextCycleDays,
          lastCheckInDate: today,
          firstCheckInAt: now,
          lastCheckInAt: now,
        })
        .onConflictDoUpdate({
          target: [checkInUserStates.configId, checkInUserStates.endUserId],
          set: {
            totalDays: nextTotal,
            currentStreak: nextStreak,
            longestStreak: nextLongest,
            currentCycleKey: newCycleKey,
            currentCycleDays: nextCycleDays,
            lastCheckInDate: today,
            lastCheckInAt: now,
            // firstCheckInAt intentionally omitted — set on insert only
          },
          setWhere: sql`${checkInUserStates.lastCheckInDate} IS DISTINCT FROM ${today}::date`,
        })
        .returning();

      if (upserted.length === 0) {
        // Lost the race: another caller signed the same user in for `today`
        // between our read and our write. Re-read and report already-checked-in.
        const refetched = await db
          .select()
          .from(checkInUserStates)
          .where(
            and(
              eq(checkInUserStates.configId, config.id),
              eq(checkInUserStates.endUserId, params.endUserId),
            ),
          )
          .limit(1);
        const current = refetched[0];
        if (!current) {
          // Extremely unlikely — someone deleted the row between our upsert
          // and our re-read. Surface it as an invariant failure rather than
          // silently returning a fake state.
          throw new Error(
            "check-in upsert returned 0 rows but row is also missing on refetch",
          );
        }
        const completion = computeCompletion(
          config.target,
          current.currentCycleDays,
        );
        return {
          alreadyCheckedIn: true,
          justCompleted: false,
          state: current,
          target: config.target,
          isCompleted: completion.isCompleted,
          remaining: completion.remaining,
        };
      }

      const state = upserted[0]!;

      const justCompleted =
        !prevCompletion.isCompleted && nextCompletion.isCompleted;

      // Grant daily reward if itemSvc is available
      let rewards: RewardEntry[] | null = null;
      if (itemSvc) {
        const rewardRows = await db
          .select()
          .from(checkInRewards)
          .where(
            and(
              eq(checkInRewards.configId, config.id),
              eq(checkInRewards.dayNumber, nextCycleDays),
            ),
          )
          .limit(1);

        const reward = rewardRows[0];
        if (reward) {
          const items = reward.rewardItems;
          if (items.length > 0) {
            await itemSvc.grantItems({
              organizationId: params.organizationId,
              endUserId: params.endUserId,
              grants: items,
              source: "check_in_reward",
              sourceId: `${config.id}:${today}`,
            });
            rewards = items;
          }
        }
      }

      if (events) {
        await events.emit("check_in.completed", {
          organizationId: params.organizationId,
          endUserId: params.endUserId,
          configId: config.id,
          cycleKey: newCycleKey,
          dateKey: today,
          streak: state.currentStreak,
          cycleDays: state.currentCycleDays,
          justCompletedCycle: justCompleted,
          rewards,
        });
      }

      return {
        alreadyCheckedIn: false,
        justCompleted,
        state,
        target: config.target,
        isCompleted: nextCompletion.isCompleted,
        remaining: nextCompletion.remaining,
        rewards,
      };
    },

    // ─── Reward CRUD ──────────────────────────────────────────

    async createReward(
      organizationId: string,
      configKey: string,
      input: {
        dayNumber: number;
        rewardItems: RewardEntry[];
        metadata?: Record<string, unknown> | null;
      },
    ) {
      const config = await loadConfigByKey(organizationId, configKey);
      validateDayNumberForConfig(config, input.dayNumber);
      const [row] = await db
        .insert(checkInRewards)
        .values({
          configId: config.id,
          organizationId,
          dayNumber: input.dayNumber,
          rewardItems: input.rewardItems,
          metadata: input.metadata ?? null,
        })
        .returning();
      if (!row) throw new Error("insert returned no row");
      return row;
    },

    async updateReward(
      organizationId: string,
      rewardId: string,
      patch: {
        dayNumber?: number;
        rewardItems?: RewardEntry[];
        metadata?: Record<string, unknown> | null;
      },
    ) {
      const updateValues: Partial<typeof checkInRewards.$inferInsert> = {};

      // When dayNumber changes, validate against the owning config's
      // resetMode/target. Single round-trip via JOIN keeps the hot path tight.
      if (patch.dayNumber !== undefined) {
        const rows = await db
          .select({
            reward: checkInRewards,
            config: checkInConfigs,
          })
          .from(checkInRewards)
          .innerJoin(
            checkInConfigs,
            eq(checkInRewards.configId, checkInConfigs.id),
          )
          .where(
            and(
              eq(checkInRewards.id, rewardId),
              eq(checkInRewards.organizationId, organizationId),
            ),
          )
          .limit(1);
        const found = rows[0];
        if (!found) throw new CheckInConfigNotFound(rewardId);
        validateDayNumberForConfig(found.config, patch.dayNumber);
        updateValues.dayNumber = patch.dayNumber;
      }
      if (patch.rewardItems !== undefined)
        updateValues.rewardItems = patch.rewardItems;
      if (patch.metadata !== undefined) updateValues.metadata = patch.metadata;

      if (Object.keys(updateValues).length === 0) {
        const rows = await db
          .select()
          .from(checkInRewards)
          .where(
            and(
              eq(checkInRewards.id, rewardId),
              eq(checkInRewards.organizationId, organizationId),
            ),
          )
          .limit(1);
        if (!rows[0]) throw new CheckInConfigNotFound(rewardId);
        return rows[0];
      }

      const [row] = await db
        .update(checkInRewards)
        .set(updateValues)
        .where(
          and(
            eq(checkInRewards.id, rewardId),
            eq(checkInRewards.organizationId, organizationId),
          ),
        )
        .returning();
      if (!row) throw new CheckInConfigNotFound(rewardId);
      return row;
    },

    async deleteReward(
      organizationId: string,
      rewardId: string,
    ): Promise<void> {
      const deleted = await db
        .delete(checkInRewards)
        .where(
          and(
            eq(checkInRewards.id, rewardId),
            eq(checkInRewards.organizationId, organizationId),
          ),
        )
        .returning({ id: checkInRewards.id });
      if (deleted.length === 0) throw new CheckInConfigNotFound(rewardId);
    },

    async listRewards(organizationId: string, configKey: string) {
      const config = await loadConfigByKey(organizationId, configKey);
      return db
        .select()
        .from(checkInRewards)
        .where(eq(checkInRewards.configId, config.id))
        .orderBy(checkInRewards.dayNumber);
    },
  };
}

export type CheckInService = ReturnType<typeof createCheckInService>;

