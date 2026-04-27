/**
 * Activity-phase gate utilities — runtime guards for cross-module callers.
 *
 * Other modules that bind a resource to an activity (`check_in_configs`,
 * `task_definitions`, `lottery_pools`, `shop_products`, …) call these
 * helpers to enforce that participation / claims only happen during the
 * right activity phase. The state machine is documented in
 * `apps/server/src/modules/activity/time.ts`; here we only translate it
 * into two simple gates:
 *
 *   - WRITABLE  = { active }              participation, score submit, …
 *   - CLAIMABLE = { active, settling }    reward / milestone claim
 *
 * Phase is computed live via `deriveState(row, now)` — never read from
 * the persisted `status` column directly, since cron lags by up to one
 * minute. The persisted `status` is read only as the `'draft'` sentinel
 * (deriveState's only non-time-driven branch).
 *
 * The batch primitive is `getActivityPhases(db, ids[])`; the single-id
 * `assert*` helpers wrap it so high-frequency paths (e.g.
 * `taskService.processEvent`) can resolve N activities in one query.
 */

import { inArray } from "drizzle-orm";

import type { AppDeps } from "../../deps";
import { activityConfigs } from "../../schema/activity";
import {
  ActivityNotFound,
  ActivityNotInClaimablePhase,
  ActivityNotInWritablePhase,
} from "./errors";
import { deriveState } from "./time";
import type { ActivityState } from "./types";

type Db = AppDeps["db"];

const WRITABLE: ReadonlySet<ActivityState> = new Set(["active"]);
const CLAIMABLE: ReadonlySet<ActivityState> = new Set(["active", "settling"]);

/**
 * Resolve live phase for a batch of activities in a single query.
 * Missing ids (deleted between caller's resource load and this call)
 * are absent from the returned Map — callers decide whether that's a
 * 404 or a silent skip.
 */
export async function getActivityPhases(
  db: Db,
  activityIds: string[],
  now: Date = new Date(),
): Promise<Map<string, ActivityState>> {
  if (activityIds.length === 0) return new Map();
  const uniq = [...new Set(activityIds)];
  const rows = await db
    .select({
      id: activityConfigs.id,
      status: activityConfigs.status,
      visibleAt: activityConfigs.visibleAt,
      startAt: activityConfigs.startAt,
      endAt: activityConfigs.endAt,
      rewardEndAt: activityConfigs.rewardEndAt,
      hiddenAt: activityConfigs.hiddenAt,
    })
    .from(activityConfigs)
    .where(inArray(activityConfigs.id, uniq));
  const out = new Map<string, ActivityState>();
  for (const r of rows) {
    out.set(r.id, deriveState(r as never, now));
  }
  return out;
}

/**
 * Throw `ActivityNotInWritablePhase` unless the activity is `active`.
 * Use at every "write / participate" entry point that can be bound to
 * an activity (sign-in submit, lottery pull, shop purchase, …).
 */
export async function assertActivityWritable(
  db: Db,
  activityId: string,
  now: Date = new Date(),
): Promise<void> {
  const map = await getActivityPhases(db, [activityId], now);
  const phase = map.get(activityId);
  if (!phase) throw new ActivityNotFound(activityId);
  if (!WRITABLE.has(phase))
    throw new ActivityNotInWritablePhase(activityId, phase);
}

/**
 * Throw `ActivityNotInClaimablePhase` unless the activity is `active`
 * or `settling`. Use at every "claim reward" entry point.
 */
export async function assertActivityClaimable(
  db: Db,
  activityId: string,
  now: Date = new Date(),
): Promise<void> {
  const map = await getActivityPhases(db, [activityId], now);
  const phase = map.get(activityId);
  if (!phase) throw new ActivityNotFound(activityId);
  if (!CLAIMABLE.has(phase))
    throw new ActivityNotInClaimablePhase(activityId, phase);
}

/**
 * Pure predicate over a phase value, for callers that already have the
 * Map from `getActivityPhases` and want to silently skip rather than
 * throw (e.g. `taskService.processEvent` over a batch of definitions).
 */
export function isWritablePhase(phase: ActivityState | undefined): boolean {
  return phase !== undefined && WRITABLE.has(phase);
}

export function isClaimablePhase(phase: ActivityState | undefined): boolean {
  return phase !== undefined && CLAIMABLE.has(phase);
}
