/**
 * Leaderboard module barrel.
 *
 * Wiring notes:
 *
 * - The service needs the shared `deps` (db / redis / events) and an
 *   optional `mailService` for cycle-settlement reward dispatch.
 * - `mailService` is imported via a lazy getter so settlement still
 *   works if the mail module is initialized after leaderboard (module
 *   load order is not fixed across future refactors).
 */

import { deps } from "../../deps";
import { registerEvent } from "../../lib/event-registry";
import { mailService } from "../mail";
import { createLeaderboardService } from "./service";
import { logger } from "../../lib/logger";

registerEvent({
  name: "leaderboard.contributed",
  owner: "leaderboard",
  description:
    "Fired when a user contributes a score to a leaderboard. `applied` is the effective delta after aggregation policy.",
  fields: [
    { path: "organizationId", type: "string", required: true },
    { path: "endUserId", type: "string", required: true },
    { path: "metricKey", type: "string", required: true },
    { path: "value", type: "number", required: true },
    { path: "applied", type: "number", required: true },
  ],
});

export { createLeaderboardService };
export type { LeaderboardService } from "./service";

export const leaderboardService = createLeaderboardService(
  deps,
  () => mailService,
);

// ─── Cross-module subscriptions ─────────────────────────────────
//
// Demonstration wiring: when a task claim fires `task.claimed`, we
// translate it into a leaderboard `contribute()` against the configured
// metric keys. Tenants configure a leaderboard config with
// `metricKey = "task.<category>"` or `metricKey = "task.claimed"` and
// this handler fans out. A tenant with no matching config gets
// `applied=0` — a no-op. This keeps the task module ignorant of
// leaderboards; adding an analytics subscriber tomorrow needs the same
// two lines here, no task-service edit required.
deps.events.on("task.claimed", async (evt) => {
  try {
    await leaderboardService.contribute({
      organizationId: evt.organizationId,
      endUserId: evt.endUserId,
      metricKey: "task.claimed",
      value: Math.max(1, evt.progressValue),
      source: `task:${evt.taskAlias ?? evt.taskId}`,
      idempotencyKey: `task:${evt.taskId}:${evt.periodKey}`,
    });
  } catch (err) {
    logger.error("[leaderboard] task.claimed subscriber failed:", err);
  }
});

// Level clears — two useful metric variants ship out of the box:
//   metricKey = "level.stars"    — best stars per user (use aggregation="max")
//   metricKey = "level.cleared"  — total levels cleared (use aggregation="sum")
// Tenants pick which via the config. We fire both contributes and let
// `contribute()` skip configs that don't exist.
deps.events.on("level.cleared", async (evt) => {
  try {
    await leaderboardService.contribute({
      organizationId: evt.organizationId,
      endUserId: evt.endUserId,
      metricKey: "level.stars",
      value: evt.stars,
      source: `level:${evt.levelId}`,
      idempotencyKey: `level.stars:${evt.levelId}:${evt.endUserId}`,
    });
    if (evt.firstClear) {
      await leaderboardService.contribute({
        organizationId: evt.organizationId,
        endUserId: evt.endUserId,
        metricKey: "level.cleared",
        value: 1,
        source: `level:${evt.levelId}`,
        idempotencyKey: `level.cleared:${evt.levelId}:${evt.endUserId}`,
      });
    }
  } catch (err) {
    logger.error("[leaderboard] level.cleared subscriber failed:", err);
  }
});

// Same pattern for activity milestone claims — tenants who want a
// "most-milestones-claimed" leaderboard just declare a config with
// `metricKey = "activity.milestone.claimed"`.
deps.events.on("activity.milestone.claimed", async (evt) => {
  try {
    await leaderboardService.contribute({
      organizationId: evt.organizationId,
      endUserId: evt.endUserId,
      metricKey: "activity.milestone.claimed",
      value: 1,
      activityContext: { activityId: evt.activityId },
      source: `activity:${evt.activityId}:milestone:${evt.milestoneAlias}`,
      idempotencyKey: `activity:${evt.activityId}:${evt.endUserId}:${evt.milestoneAlias}`,
    });
  } catch (err) {
    logger.error(
      "[leaderboard] activity.milestone.claimed subscriber failed:",
      err,
    );
  }
});

export { leaderboardRouter } from "./routes";
export { leaderboardClientRouter } from "./client-routes";
