import type {
  taskCategories,
  taskDefinitions,
  taskUserMilestoneClaims,
  taskUserProgress,
} from "../../schema/task";

/**
 * Drizzle's `$inferSelect` is the authoritative row shape. Re-exported
 * here so schema changes propagate automatically.
 */
export type TaskCategory = typeof taskCategories.$inferSelect;
export type TaskDefinition = typeof taskDefinitions.$inferSelect;
export type TaskUserProgress = typeof taskUserProgress.$inferSelect;
export type TaskUserMilestoneClaim =
  typeof taskUserMilestoneClaims.$inferSelect;

export type { TaskRewardTier } from "../../schema/task";

/** Task period — drives lazy reset cycle logic. */
export const TASK_PERIODS = ["daily", "weekly", "monthly", "none"] as const;
export type TaskPeriod = (typeof TASK_PERIODS)[number];

/** How progress increments towards targetValue. */
export const COUNTING_METHODS = [
  "event_count",
  "event_value",
  "child_completion",
] as const;
export type CountingMethod = (typeof COUNTING_METHODS)[number];

/** Category scope — free-form display tag. */
export const CATEGORY_SCOPES = ["task", "achievement", "custom"] as const;
export type CategoryScope = (typeof CATEGORY_SCOPES)[number];
