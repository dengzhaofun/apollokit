import type {
  cdkeyBatches,
  cdkeyCodes,
  cdkeyRedemptionLogs,
  cdkeyUserStates,
} from "../../schema/cdkey";
import type { RewardEntry } from "../../lib/rewards";

export type CdkeyBatch = typeof cdkeyBatches.$inferSelect;
export type CdkeyCode = typeof cdkeyCodes.$inferSelect;
export type CdkeyUserState = typeof cdkeyUserStates.$inferSelect;
export type CdkeyRedemptionLog = typeof cdkeyRedemptionLogs.$inferSelect;

export type CdkeyCodeType = "universal" | "unique";

export type CdkeyRedeemStatus = "success" | "already_redeemed";

export type CdkeyRedeemResult = {
  status: CdkeyRedeemStatus;
  batchId: string;
  codeId: string;
  code: string;
  reward: RewardEntry[];
  logId: string;
};
