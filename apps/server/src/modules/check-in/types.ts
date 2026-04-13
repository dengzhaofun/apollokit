import type {
  checkInConfigs,
  checkInRewards,
  checkInUserStates,
} from "../../schema/check-in";

export const RESET_MODES = ["none", "week", "month"] as const;
export type ResetMode = (typeof RESET_MODES)[number];

/**
 * Drizzle gives us `$inferSelect` for read-side row types — that IS the
 * authoritative TypeScript shape for what comes out of the database, so
 * we re-export it here instead of re-typing by hand.
 *
 * For the write-side (service inputs) we derive types from zod via
 * `z.input` in `./validators.ts` — the zod schema is already the source
 * of truth for HTTP validation, so sharing the same definition avoids
 * drift between "what HTTP accepts" and "what the service accepts".
 */
export type CheckInConfig = typeof checkInConfigs.$inferSelect;
export type CheckInUserState = typeof checkInUserStates.$inferSelect;
export type CheckInReward = typeof checkInRewards.$inferSelect;

export type CheckInResult = {
  alreadyCheckedIn: boolean;
  justCompleted: boolean;
  state: CheckInUserState;
  target: number | null;
  isCompleted: boolean;
  remaining: number | null;
  rewards?: Array<{ definitionId: string; quantity: number }> | null;
};

export type CheckInUserStateView = {
  state: CheckInUserState;
  target: number | null;
  isCompleted: boolean;
  remaining: number | null;
};
