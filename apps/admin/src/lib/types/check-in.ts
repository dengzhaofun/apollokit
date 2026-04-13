export type ResetMode = "none" | "week" | "month"

export interface CheckInConfig {
  id: string
  organizationId: string
  alias: string | null
  name: string
  description: string | null
  resetMode: ResetMode
  weekStartsOn: number
  target: number | null
  timezone: string
  isActive: boolean
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface CheckInUserState {
  configId: string
  endUserId: string
  organizationId: string
  totalDays: number
  currentStreak: number
  longestStreak: number
  currentCycleKey: string | null
  currentCycleDays: number
  lastCheckInDate: string | null
  firstCheckInAt: string | null
  lastCheckInAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CheckInResult {
  alreadyCheckedIn: boolean
  justCompleted: boolean
  state: CheckInUserState
  target: number | null
  isCompleted: boolean
  remaining: number | null
  rewards: { definitionId: string; quantity: number }[] | null
}

export interface CheckInUserStateView {
  state: CheckInUserState
  target: number | null
  isCompleted: boolean
  remaining: number | null
}

export interface CreateConfigInput {
  name: string
  alias?: string | null
  description?: string | null
  resetMode: ResetMode
  weekStartsOn?: number
  target?: number | null
  timezone?: string
  isActive?: boolean
  metadata?: Record<string, unknown> | null
}

export interface UpdateConfigInput {
  name?: string
  alias?: string | null
  description?: string | null
  weekStartsOn?: number
  target?: number | null
  timezone?: string
  isActive?: boolean
  metadata?: Record<string, unknown> | null
}
