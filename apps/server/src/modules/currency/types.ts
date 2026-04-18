import type {
  currencies,
  currencyLedger,
  currencyWallets,
} from "../../schema/currency";

export type CurrencyDefinition = typeof currencies.$inferSelect;
export type CurrencyWallet = typeof currencyWallets.$inferSelect;
export type CurrencyLedgerEntry = typeof currencyLedger.$inferSelect;

/**
 * A single currency entry used across `RewardEntry[]` dispatch and any
 * admin grant/deduct API payload. Mirrors the `ItemEntry` shape so that
 * Admin UIs that build reward rows can map a uniform (id, amount) tuple
 * into either item or currency semantics downstream.
 */
export type CurrencyEntry = {
  currencyId: string;
  amount: number;
};

export type CurrencyGrantResult = {
  grants: Array<{
    currencyId: string;
    balanceBefore: number;
    balanceAfter: number;
    delta: number;
  }>;
};

export type CurrencyDeductResult = {
  deductions: Array<{
    currencyId: string;
    balanceBefore: number;
    balanceAfter: number;
    delta: number;
  }>;
};

export type WalletView = {
  currencyId: string;
  currencyAlias: string | null;
  currencyName: string;
  icon: string | null;
  balance: number;
};

export type LedgerQuery = {
  endUserId?: string;
  currencyId?: string;
  source?: string;
  sourceId?: string;
  limit?: number;
  cursor?: string;
};

export type LedgerPage = {
  items: CurrencyLedgerEntry[];
  nextCursor?: string;
};
