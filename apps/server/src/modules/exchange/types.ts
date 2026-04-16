import type {
  exchangeConfigs,
  exchangeOptions,
  exchangeUserStates,
} from "../../schema/exchange";
import type { RewardEntry } from "../../lib/rewards";

export type ExchangeConfig = typeof exchangeConfigs.$inferSelect;
export type ExchangeOption = typeof exchangeOptions.$inferSelect;
export type ExchangeUserState = typeof exchangeUserStates.$inferSelect;

export type ExchangeResult = {
  success: boolean;
  exchangeId: string;
  optionId: string;
  costItems: RewardEntry[];
  rewardItems: RewardEntry[];
};
