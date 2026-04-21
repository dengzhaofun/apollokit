import type {
  AssistPoolConfig,
  AssistPoolContribution,
  AssistPoolInstance,
  AssistPoolRewardLedger,
} from "../../schema/assist-pool";

export type {
  AssistPoolConfig,
  AssistPoolContribution,
  AssistPoolInstance,
  AssistPoolRewardLedger,
};

export const ASSIST_POOL_MODES = ["accumulate", "decrement"] as const;
export type AssistPoolMode = (typeof ASSIST_POOL_MODES)[number];

export const ASSIST_POOL_STATUSES = [
  "in_progress",
  "completed",
  "expired",
] as const;
export type AssistPoolStatus = (typeof ASSIST_POOL_STATUSES)[number];

export const ASSIST_POLICY_KINDS = ["fixed", "uniform", "decaying"] as const;
export type AssistPolicyKind = (typeof ASSIST_POLICY_KINDS)[number];

/**
 * Normalized result of a single `contribute` call. `status` is the
 * instance status AFTER the contribution is applied. When the call
 * actually settles the instance, `rewards` holds what was granted —
 * this is `null` for all other branches (non-completing, expired,
 * idempotent replay).
 */
export type ContributeResult = {
  instance: AssistPoolInstance;
  contribution: AssistPoolContribution;
  completed: boolean;
  rewards: AssistPoolRewardLedger | null;
};
