/**
 * Pure time utilities for the activity state machine.
 *
 * The derived state is a total function of the five time points and
 * `now`. The stored `status` column is the cron-persisted snapshot —
 * it lags the live answer by at most one cron tick. Every read path
 * prefers the live answer from `deriveState`; `status` exists only so
 * lifecycle transitions (publish, archive) can be indexed and fired
 * exactly once.
 */

import type { ActivityConfig } from "../../schema/activity";
import type { ActivityState, ActivityTimeline } from "./types";

export function deriveState(
  config: Pick<
    ActivityConfig,
    "status" | "visibleAt" | "startAt" | "endAt" | "hiddenAt"
  >,
  now: Date,
): ActivityState {
  // Draft is only transitioned out of by explicit publish.
  if (config.status === "draft") return "draft";
  const t = now.getTime();
  if (t >= config.hiddenAt.getTime()) return "archived";
  if (t >= config.endAt.getTime()) return "ended";
  if (t >= config.startAt.getTime()) return "active";
  if (t >= config.visibleAt.getTime()) return "teasing";
  return "scheduled";
}

export function deriveTimeline(
  config: Pick<
    ActivityConfig,
    "status" | "visibleAt" | "startAt" | "endAt" | "hiddenAt"
  >,
  now: Date,
): ActivityTimeline {
  const state = deriveState(config, now);
  const t = now.getTime();
  return {
    state,
    now,
    msToVisible: Math.max(0, config.visibleAt.getTime() - t),
    msToStart: Math.max(0, config.startAt.getTime() - t),
    msToEnd: Math.max(0, config.endAt.getTime() - t),
    msToHidden: Math.max(0, config.hiddenAt.getTime() - t),
  };
}

/**
 * Validate that the four time points respect the required ordering.
 * Callers throw `ActivityInvalidInput` with a helpful message.
 */
export function validateTimeOrder(t: {
  visibleAt: Date;
  startAt: Date;
  endAt: Date;
  hiddenAt: Date;
}): string | null {
  if (!(t.visibleAt.getTime() <= t.startAt.getTime())) {
    return "visibleAt must be <= startAt";
  }
  if (!(t.startAt.getTime() < t.endAt.getTime())) {
    return "startAt must be < endAt";
  }
  if (!(t.endAt.getTime() <= t.hiddenAt.getTime())) {
    return "endAt must be <= hiddenAt";
  }
  return null;
}

import { Cron } from "croner";
import { logger } from "../../lib/logger";

/**
 * Compute the next `fireAt` for an activity schedule.
 *
 *   - `once_at`         → returns fireAt verbatim (or null if missing)
 *   - `relative_offset` → returns `base + offsetSeconds` where `base`
 *                         comes from the activity's `offsetFrom` anchor
 *   - `cron`            → parses `cronExpr` via `croner` and returns
 *                         the next match after `from` (default: now)
 */
export function computeNextFireAt(
  schedule: {
    triggerKind: string;
    fireAt: Date | null;
    offsetFrom: string | null;
    offsetSeconds: number | null;
    cronExpr?: string | null;
  },
  activity: {
    visibleAt: Date;
    startAt: Date;
    endAt: Date;
    hiddenAt: Date;
    timezone?: string;
  },
  from: Date = new Date(),
): Date | null {
  switch (schedule.triggerKind) {
    case "once_at":
      return schedule.fireAt ?? null;
    case "relative_offset": {
      if (schedule.offsetSeconds === null) return null;
      const anchor =
        schedule.offsetFrom === "visible_at"
          ? activity.visibleAt
          : schedule.offsetFrom === "end_at"
            ? activity.endAt
            : schedule.offsetFrom === "hidden_at"
              ? activity.hiddenAt
              : activity.startAt; // default: start_at
      return new Date(anchor.getTime() + schedule.offsetSeconds * 1000);
    }
    case "cron": {
      if (!schedule.cronExpr) return null;
      try {
        const cron = new Cron(schedule.cronExpr, {
          timezone: activity.timezone ?? "UTC",
        });
        return cron.nextRun(from) ?? null;
      } catch (err) {
        logger.error(
          `[activity] invalid cron expression "${schedule.cronExpr}":`,
          err,
        );
        return null;
      }
    }
    default:
      return null;
  }
}
