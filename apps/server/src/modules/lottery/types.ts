import type {
  lotteryPools,
  lotteryTiers,
  lotteryPrizes,
  lotteryPityRules,
  lotteryUserStates,
  lotteryPullLogs,
} from "../../schema/lottery";
import type { RewardEntry } from "../../lib/rewards";

export type LotteryPool = typeof lotteryPools.$inferSelect;
export type LotteryTier = typeof lotteryTiers.$inferSelect;
export type LotteryPrize = typeof lotteryPrizes.$inferSelect;
export type LotteryPityRule = typeof lotteryPityRules.$inferSelect;
export type LotteryUserState = typeof lotteryUserStates.$inferSelect;
export type LotteryPullLog = typeof lotteryPullLogs.$inferSelect;

export type PullResultEntry = {
  batchIndex: number;
  prizeId: string;
  prizeName: string;
  tierId: string | null;
  tierName: string | null;
  rewardItems: RewardEntry[];
  pityTriggered: boolean;
  pityRuleId: string | null;
};

export type PullResult = {
  batchId: string;
  poolId: string;
  endUserId: string;
  costItems: RewardEntry[];
  pulls: PullResultEntry[];
};
