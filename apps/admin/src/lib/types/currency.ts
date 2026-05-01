export interface CurrencyDefinition {
  id: string
  organizationId: string
  alias: string | null
  name: string
  description: string | null
  icon: string | null
  sortOrder: string
  isActive: boolean
  activityId: string | null
  activityNodeId: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface WalletView {
  currencyId: string
  currencyAlias: string | null
  currencyName: string
  icon: string | null
  balance: number
}

export interface CurrencyBalance {
  currencyId: string
  balance: number
}

export interface LedgerEntry {
  id: string
  organizationId: string
  endUserId: string
  currencyId: string
  delta: number
  source: string
  sourceId: string | null
  balanceBefore: number | null
  balanceAfter: number | null
  createdAt: string
}

export interface LedgerPage {
  items: LedgerEntry[]
  nextCursor?: string
}

export interface GrantCurrencyEntry {
  currencyId: string
  amount: number
}

export interface GrantResultEntry {
  currencyId: string
  balanceBefore: number
  balanceAfter: number
  delta: number
}

export interface GrantCurrencyResult {
  grants: GrantResultEntry[]
}

export interface DeductCurrencyResult {
  deductions: GrantResultEntry[]
}

export interface CreateCurrencyInput {
  name: string
  alias?: string | null
  description?: string | null
  icon?: string | null
  isActive?: boolean
  activityId?: string | null
  activityNodeId?: string | null
  metadata?: Record<string, unknown> | null
}

export interface UpdateCurrencyInput {
  name?: string
  alias?: string | null
  description?: string | null
  icon?: string | null
  isActive?: boolean
  activityId?: string | null
  activityNodeId?: string | null
  metadata?: Record<string, unknown> | null
}

export interface GrantCurrencyInput {
  endUserId: string
  grants: GrantCurrencyEntry[]
  source: string
  sourceId?: string
}

export interface DeductCurrencyInput {
  endUserId: string
  deductions: GrantCurrencyEntry[]
  source: string
  sourceId?: string
}

export interface LedgerQuery {
  endUserId?: string
  currencyId?: string
  source?: string
  sourceId?: string
  limit?: number
  cursor?: string
}
