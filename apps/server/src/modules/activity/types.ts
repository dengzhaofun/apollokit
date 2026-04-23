import type {
  ActivityConfig,
  ActivityNode,
  ActivityUserProgressRow,
  ActivityUserReward,
  ActivitySchedule,
  ActivityCleanupRule,
  ActivityCurrency,
  ActivityMilestoneTier,
  ActivityNodeUnlockRule,
} from "../../schema/activity";

export type {
  ActivityConfig,
  ActivityNode,
  ActivityUserProgressRow,
  ActivityUserReward,
  ActivitySchedule,
  ActivityCleanupRule,
  ActivityCurrency,
  ActivityMilestoneTier,
  ActivityNodeUnlockRule,
};

export const ACTIVITY_KINDS = [
  "generic",
  "check_in_only",
  "board_game",
  "gacha",
  "season_pass",
  "custom",
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export const ACTIVITY_VISIBILITIES = [
  "public",
  "hidden",
  "targeted",
] as const;
export type ActivityVisibility = (typeof ACTIVITY_VISIBILITIES)[number];

export const ACTIVITY_STATES = [
  "draft",
  "scheduled",
  "teasing",
  "active",
  "settling",
  "ended",
  "archived",
] as const;
export type ActivityState = (typeof ACTIVITY_STATES)[number];

export const NODE_TYPES = [
  "check_in",
  "task_group",
  "exchange",
  "leaderboard",
  "lottery",
  "banner",
  "assist_pool",
  "game_board",
  "custom",
] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export const TRIGGER_KINDS = [
  "once_at",
  "relative_offset",
  "cron",
] as const;
export type TriggerKind = (typeof TRIGGER_KINDS)[number];

export const ACTION_TYPES = [
  "emit_bus_event",
  "grant_reward",
  "broadcast_mail",
  "set_flag",
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const CLEANUP_MODES = ["purge", "convert", "keep"] as const;
export type CleanupMode = (typeof CLEANUP_MODES)[number];

export type ActivityTimeline = {
  state: ActivityState;
  now: Date;
  msToVisible: number;
  msToStart: number;
  msToEnd: number;
  msToRewardEnd: number;
  msToHidden: number;
};

/**
 * Aggregated client view returned by `getActivityForUser`.
 * The response is deliberately flat so a single HTTP round-trip renders
 * the whole page.
 *
 * `effectiveEnabled` is the derived truth callers should trust —
 * `node.enabled && resource.isActive`. Virtual nodes (no refId)
 * contribute only `node.enabled`. Exposed separately from the raw
 * `node.enabled` so admin UIs can show both layers without ambiguity.
 */
export type ActivityViewForUser = {
  activity: ActivityConfig & {
    timeline: ActivityTimeline;
    derivedState: ActivityState;
  };
  progress: ActivityUserProgressRow | null;
  nodes: Array<{
    node: ActivityNode;
    unlocked: boolean;
    resourceActive: boolean;
    effectiveEnabled: boolean;
    playerStatus: unknown; // shaped by each node handler
  }>;
};
