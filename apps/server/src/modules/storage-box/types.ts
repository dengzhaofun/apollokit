import type {
  storageBoxConfigs,
  storageBoxDeposits,
  storageBoxLogs,
} from "../../schema/storage-box";

export type StorageBoxType = "demand" | "fixed";
export type StorageBoxDepositStatus = "active" | "withdrawn";
export type StorageBoxLogAction =
  | "deposit"
  | "withdraw"
  | "interest_accrual";

export type StorageBoxConfig = typeof storageBoxConfigs.$inferSelect;
export type StorageBoxDeposit = typeof storageBoxDeposits.$inferSelect;
export type StorageBoxLog = typeof storageBoxLogs.$inferSelect;

/**
 * Deposit row with live-projected interest. `projectedInterest` includes
 * both `accruedInterest` (already flushed to the row) and the additional
 * interest earned between `lastAccrualAt` and `now`.
 */
export type StorageBoxDepositView = StorageBoxDeposit & {
  projectedInterest: number;
  isMatured: boolean;
};

export type DepositResult = {
  deposit: StorageBoxDeposit;
  currencyDeducted: number;
};

export type WithdrawResult = {
  deposit: StorageBoxDeposit;
  principalPaid: number;
  interestPaid: number;
  currencyGranted: number;
};
