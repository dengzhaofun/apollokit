import type {
  leaderboardConfigs,
  leaderboardEntries,
  leaderboardSnapshots,
  LeaderboardRewardTier,
  LeaderboardSnapshotRow,
} from "../../schema/leaderboard";

export type LeaderboardConfig = typeof leaderboardConfigs.$inferSelect;
export type LeaderboardEntry = typeof leaderboardEntries.$inferSelect;
export type LeaderboardSnapshot = typeof leaderboardSnapshots.$inferSelect;

export type { LeaderboardRewardTier, LeaderboardSnapshotRow };

export const CYCLE_MODES = [
  "daily",
  "weekly",
  "monthly",
  "all_time",
] as const;
export type CycleMode = (typeof CYCLE_MODES)[number];

export const SCOPE_MODES = [
  "global",
  "guild",
  "team",
  "friend",
] as const;
export type ScopeMode = (typeof SCOPE_MODES)[number];

export const AGGREGATION_MODES = ["sum", "max", "latest"] as const;
export type AggregationMode = (typeof AGGREGATION_MODES)[number];

export const TIE_BREAKERS = ["earliest", "latest"] as const;
export type TieBreaker = (typeof TIE_BREAKERS)[number];

export const CONFIG_STATUSES = [
  "draft",
  "active",
  "paused",
  "archived",
] as const;
export type ConfigStatus = (typeof CONFIG_STATUSES)[number];

/**
 * Context passed to `contribute()`. Every field except
 * `organizationId`, `endUserId`, `metricKey`, `value` is optional —
 * the service figures out which configs match based on what it can
 * compute a scopeKey for.
 */
export type ContributeInput = {
  organizationId: string;
  endUserId: string;
  metricKey: string;
  value: number;
  scopeContext?: {
    guildId?: string;
    teamId?: string;
    /**
     * For scope="friend": pass the list of users whose friend board
     * should be credited. The caller (typically a friend service) is
     * responsible for figuring out which users this contributor is a
     * friend of.
     */
    friendOwnerIds?: string[];
  };
  activityContext?: {
    activityId: string;
    nodeAlias?: string;
  };
  source?: string;
  /**
   * Stable idempotency key for this contribute call. When set, the
   * service refuses to apply the same `(configId, idempotencyKey)`
   * twice — this lets callers retry safely.
   *
   * Phase 1 MVP implements this as a best-effort Redis SETNX; later
   * phases may back it with a PG table if stronger guarantees are
   * needed.
   */
  idempotencyKey?: string;
  /** Fresh display info for this user (name / avatar / level …). */
  displaySnapshot?: Record<string, unknown>;
  /** Override clock for tests. */
  now?: Date;
};

export type FanoutResult = {
  /** How many configs this contribute call touched. */
  applied: number;
  /** Per-config record of what happened. */
  details: Array<{
    configId: string;
    alias: string;
    scopeKey: string;
    cycleKey: string;
    newScore: number | null;
    skipped?: "inactive" | "time_window" | "no_scope_key" | "idempotent";
  }>;
};

export type LeaderboardRanking = {
  rank: number;
  endUserId: string;
  score: number;
  displaySnapshot?: Record<string, unknown> | null;
};

export type TopResult = {
  configId: string;
  alias: string;
  cycleKey: string;
  scopeKey: string;
  rankings: LeaderboardRanking[];
  self?: {
    rank: number | null;
    score: number | null;
  };
};
