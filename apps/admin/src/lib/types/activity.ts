export type ActivityKind =
  | "generic"
  | "check_in_only"
  | "board_game"
  | "gacha"
  | "season_pass"
  | "custom"

export type ActivityVisibility = "public" | "hidden" | "targeted"

export type ActivityState =
  | "draft"
  | "scheduled"
  | "teasing"
  | "active"
  | "settling"
  | "ended"
  | "archived"

export type NodeType =
  | "check_in"
  | "task_group"
  | "exchange"
  | "leaderboard"
  | "lottery"
  | "banner"
  | "game_board"
  | "entity_blueprint"
  | "item_definition"
  | "currency_definition"
  | "assist_pool"
  | "custom"

export type TriggerKind = "once_at" | "relative_offset" | "cron"

export type ActionType =
  | "emit_bus_event"
  | "grant_reward"
  | "broadcast_mail"
  | "set_flag"

import type { RewardEntry } from "./rewards"
export type { RewardEntry }

export interface ActivityCurrency {
  alias: string
  name: string
  icon?: string | null
}

export interface ActivityMilestoneTier {
  alias: string
  points: number
  rewards: RewardEntry[]
}

export interface ActivityCleanupRule {
  mode: "purge" | "convert" | "keep"
  conversionMap?: Record<string, RewardEntry[]>
}

export type ActivityQueueFormat = "numeric" | "alphanumeric"

export interface ActivityMembershipConfig {
  leaveAllowed?: boolean
  queue?: {
    enabled: boolean
    format: ActivityQueueFormat
    length: number
  }
}

export type ActivityMemberStatus = "joined" | "completed" | "dropped" | "left"

export interface Activity {
  id: string
  organizationId: string
  alias: string
  name: string
  description: string | null
  bannerImage: string | null
  themeColor: string | null
  kind: ActivityKind
  visibleAt: string
  startAt: string
  endAt: string
  rewardEndAt: string
  hiddenAt: string
  timezone: string
  status: ActivityState
  currency: ActivityCurrency | null
  milestoneTiers: ActivityMilestoneTier[]
  globalRewards: RewardEntry[]
  kindMetadata: Record<string, unknown> | null
  cleanupRule: ActivityCleanupRule
  joinRequirement: Record<string, unknown> | null
  visibility: ActivityVisibility
  templateId: string | null
  metadata: Record<string, unknown> | null
  membership: ActivityMembershipConfig | null
  createdAt: string
  updatedAt: string
}

export interface ActivityNode {
  id: string
  activityId: string
  organizationId: string
  alias: string
  nodeType: NodeType
  refId: string | null
  orderIndex: number
  unlockRule: Record<string, unknown> | null
  nodeConfig: Record<string, unknown> | null
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface ActivitySchedule {
  id: string
  activityId: string
  organizationId: string
  alias: string
  triggerKind: TriggerKind
  cronExpr: string | null
  fireAt: string | null
  offsetFrom: string | null
  offsetSeconds: number | null
  actionType: ActionType
  actionConfig: Record<string, unknown>
  lastFiredAt: string | null
  lastStatus: string | null
  nextFireAt: string | null
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateActivityInput {
  alias: string
  name: string
  description?: string | null
  bannerImage?: string | null
  themeColor?: string | null
  kind?: ActivityKind
  visibleAt: string
  startAt: string
  endAt: string
  rewardEndAt: string
  hiddenAt: string
  timezone?: string
  currency?: ActivityCurrency | null
  milestoneTiers?: ActivityMilestoneTier[]
  globalRewards?: RewardEntry[]
  kindMetadata?: Record<string, unknown> | null
  cleanupRule?: ActivityCleanupRule
  joinRequirement?: Record<string, unknown> | null
  visibility?: ActivityVisibility
  metadata?: Record<string, unknown> | null
  membership?: ActivityMembershipConfig | null
}

export type UpdateActivityInput = Partial<
  Omit<CreateActivityInput, "alias"> & {
    alias?: never
  }
>

export interface CreateNodeInput {
  alias: string
  nodeType: NodeType
  refId?: string | null
  orderIndex?: number
  unlockRule?: Record<string, unknown> | null
  nodeConfig?: Record<string, unknown> | null
  enabled?: boolean
}

export interface ActivityMember {
  id: string
  activityId: string
  organizationId: string
  endUserId: string
  joinedAt: string
  lastActiveAt: string
  activityPoints: number
  milestonesAchieved: string[]
  nodeState: Record<string, unknown>
  status: ActivityMemberStatus
  completedAt: string | null
  leftAt: string | null
  queueNumber: string | null
  queueNumberUsedAt: string | null
  version: number
  createdAt: string
  updatedAt: string
}

/** Lightweight row returned by the admin `/api/activity/{key}/members` list. */
export interface ActivityMemberListItem {
  endUserId: string
  status: ActivityMemberStatus
  joinedAt: string
  lastActiveAt: string
  completedAt: string | null
  leftAt: string | null
  queueNumber: string | null
  queueNumberUsedAt: string | null
  activityPoints: number
}

/** Backwards-compat alias — the server used to return this shape. */
export type ActivityUserProgress = ActivityMember

export interface ActivityTimeline {
  state: ActivityState
  now: string
  msToVisible: number
  msToStart: number
  msToEnd: number
  msToRewardEnd: number
  msToHidden: number
}

export interface ActivityViewForUser {
  activity: Activity & {
    timeline: ActivityTimeline
    derivedState: ActivityState
  }
  progress: ActivityMember | null
  nodes: Array<{
    node: ActivityNode
    unlocked: boolean
    resourceActive: boolean
    effectiveEnabled: boolean
    playerStatus: unknown
  }>
}

export type ActivityTemplateDurationSpec = {
  teaseSeconds: number
  activeSeconds: number
  rewardSeconds: number
  hiddenSeconds: number
}

export type ActivityTemplateRecurrence =
  | {
      mode: "weekly"
      dayOfWeek: number
      hourOfDay: number
      timezone: string
    }
  | {
      mode: "monthly"
      dayOfMonth: number
      hourOfDay: number
      timezone: string
    }
  | { mode: "manual" }

export interface ActivityNodeBlueprint {
  alias: string
  nodeType: NodeType
  refIdStrategy: "fixed" | "omit" | "link_only"
  fixedRefId?: string | null
  orderIndex?: number
  unlockRule?: Record<string, unknown> | null
  nodeConfig?: Record<string, unknown> | null
  enabled?: boolean
}

export interface ActivityScheduleBlueprint {
  alias: string
  triggerKind: TriggerKind
  fireAtOffsetSeconds?: number
  offsetFrom?: string
  offsetSeconds?: number
  cronExpr?: string
  actionType: ActionType
  actionConfig?: Record<string, unknown>
  enabled?: boolean
}

export interface ActivityTemplate {
  id: string
  organizationId: string
  alias: string
  name: string
  description: string | null
  templatePayload: Record<string, unknown>
  durationSpec: ActivityTemplateDurationSpec
  recurrence: ActivityTemplateRecurrence
  aliasPattern: string
  nodesBlueprint: ActivityNodeBlueprint[]
  schedulesBlueprint: ActivityScheduleBlueprint[]
  autoPublish: boolean
  nextInstanceAt: string | null
  lastInstantiatedAlias: string | null
  lastInstantiatedAt: string | null
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateActivityTemplateInput {
  alias: string
  name: string
  description?: string | null
  templatePayload: Record<string, unknown>
  durationSpec: ActivityTemplateDurationSpec
  recurrence: ActivityTemplateRecurrence
  aliasPattern: string
  nodesBlueprint?: ActivityNodeBlueprint[]
  schedulesBlueprint?: ActivityScheduleBlueprint[]
  autoPublish?: boolean
  enabled?: boolean
}

export interface CreateScheduleInput {
  alias: string
  triggerKind: TriggerKind
  fireAt?: string | null
  offsetFrom?: string | null
  offsetSeconds?: number | null
  cronExpr?: string | null
  actionType: ActionType
  actionConfig?: Record<string, unknown>
  enabled?: boolean
}
