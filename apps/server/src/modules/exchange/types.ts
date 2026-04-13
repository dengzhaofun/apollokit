import type {
  exchangeConfigs,
  exchangeOptions,
  exchangeUserStates,
} from "../../schema/exchange";
import type { ItemEntry } from "../item/types";

export type ExchangeConfig = typeof exchangeConfigs.$inferSelect;
export type ExchangeOption = typeof exchangeOptions.$inferSelect;
export type ExchangeUserState = typeof exchangeUserStates.$inferSelect;

/** @deprecated Use `ItemEntry` from `../item/types` directly. */
export type ExchangeItemEntry = ItemEntry;

export type ExchangeResult = {
  success: boolean;
  exchangeId: string;
  optionId: string;
  costItems: ItemEntry[];
  rewardItems: ItemEntry[];
};
