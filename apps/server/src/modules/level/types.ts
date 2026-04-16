import type {
  levelConfigs,
  levelStages,
  levels,
  levelUserProgress,
} from "../../schema/level";

// Re-export $inferSelect types
export type LevelConfig = typeof levelConfigs.$inferSelect;
export type LevelStage = typeof levelStages.$inferSelect;
export type Level = typeof levels.$inferSelect;
export type LevelUserProgress = typeof levelUserProgress.$inferSelect;

// Status enum for user progress
export const LEVEL_STATUSES = ["unlocked", "cleared"] as const;
export type LevelStatus = (typeof LEVEL_STATUSES)[number];

// Star reward entry stored in levels.starRewards JSONB
import type { RewardEntry } from "../../lib/rewards";
export type StarRewardTier = {
  stars: number;
  rewards: RewardEntry[];
};

// Unlock rule discriminated union — stored as JSONB
export type UnlockRule =
  | { type: "auto" }
  | { type: "level_clear"; levelId: string }
  | { type: "level_stars"; levelId: string; stars: number }
  | { type: "stage_clear"; stageId: string }
  | { type: "star_threshold"; threshold: number }
  | { type: "all"; rules: UnlockRule[] }
  | { type: "any"; rules: UnlockRule[] };

// Claim target types
export const CLAIM_TYPES = ["clear", "star"] as const;
export type ClaimType = (typeof CLAIM_TYPES)[number];
