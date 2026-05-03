/**
 * Trigger 引擎前端类型 —— 与 server `modules/triggers/types.ts` 对齐。
 * 任何后端类型变化都得手动同步到这里(项目当前还没接通 SDK 自动生成 trigger 类型)。
 */

export type TriggerRuleStatus = "active" | "disabled" | "archived"

export const TRIGGER_RULE_STATUSES: readonly TriggerRuleStatus[] = [
  "active",
  "disabled",
  "archived",
] as const

export type TriggerExecutionStatus =
  | "success"
  | "partial"
  | "failed"
  | "throttled"
  | "condition_failed"

export type EmitEventAction = {
  type: "emit_event"
  eventName: string
  data: Record<string, unknown>
}

export type GrantRewardAction = {
  type: "grant_reward"
  rewardKindKey: string
  amount: number
  reason: string
}

export type UnlockFeatureAction = {
  type: "unlock_feature"
  featureKey: string
}

export type SendNotificationAction = {
  type: "send_notification"
  templateKey: string
  vars?: Record<string, unknown>
}

export type TriggerAction =
  | EmitEventAction
  | GrantRewardAction
  | UnlockFeatureAction
  | SendNotificationAction

export type TriggerActionType = TriggerAction["type"]

export const TRIGGER_ACTION_TYPES: readonly TriggerActionType[] = [
  "emit_event",
  "grant_reward",
  "unlock_feature",
  "send_notification",
] as const

/**
 * 已实现的 action(其它 stub 抛 not_implemented)。
 *
 * 注意:这里**没有** dispatch_webhook —— trigger 是「内循环替代 webhook」
 * 的设计,要把事件推到外部 webhook 走 webhook 模块自身订阅,不经 trigger。
 */
export const IMPLEMENTED_ACTION_TYPES: readonly TriggerActionType[] = [
  "emit_event",
  "unlock_feature",
] as const

export type TriggerThrottle = {
  perUserPerMinute?: number
  perUserPerHour?: number
  perUserPerDay?: number
  perOrgPerMinute?: number
  perOrgPerHour?: number
}

export type TriggerActionResult = {
  type: TriggerActionType
  status: "success" | "failed" | "skipped"
  durationMs: number
  error?: string
  data?: Record<string, unknown>
}

/**
 * xyflow graph 持久化 —— admin UI 复原画布用。运行时不读这个字段,
 * 只读 normalized 的 condition + actions。
 *
 * `nodes` / `edges` 是 xyflow 的标准 shape;`Record<string, unknown>`
 * 直接当 jsonb 存,前端按需解析。
 */
export type TriggerGraph = {
  nodes: Array<{
    id: string
    type: string
    position: { x: number; y: number }
    data?: Record<string, unknown>
  }>
  edges: Array<{
    id: string
    source: string
    target: string
  }>
}

export type TriggerRule = {
  id: string
  tenantId: string
  name: string
  description: string | null
  status: TriggerRuleStatus
  triggerEvent: string
  /** JSONLogic expression; null = 无条件触发。 */
  condition: unknown | null
  actions: TriggerAction[]
  throttle: TriggerThrottle | null
  graph: TriggerGraph | null
  version: number
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export type TriggerRuleListResponse = {
  items: TriggerRule[]
}

export type CreateTriggerRuleInput = {
  name: string
  description?: string
  status?: TriggerRuleStatus
  triggerEvent: string
  condition?: unknown
  actions: TriggerAction[]
  throttle?: TriggerThrottle | null
  graph?: TriggerGraph | null
}

export type UpdateTriggerRuleInput = {
  name?: string
  description?: string | null
  status?: TriggerRuleStatus
  triggerEvent?: string
  condition?: unknown
  actions?: TriggerAction[]
  throttle?: TriggerThrottle | null
  graph?: TriggerGraph | null
  /** 乐观锁 —— 必须传当前 version。 */
  version: number
}

export type DryRunResult = {
  ruleId: string
  status: TriggerExecutionStatus
  conditionResult: boolean | null
  actionResults: TriggerActionResult[]
}

export type DryRunResponse = {
  results: DryRunResult[]
}

export type TriggerExecution = {
  id: string
  tenantId: string
  ruleId: string
  ruleVersion: number
  eventName: string
  endUserId: string | null
  traceId: string | null
  conditionResult: string | null
  actionResults: TriggerActionResult[] | null
  startedAt: string
  finishedAt: string | null
  status: TriggerExecutionStatus
}

export type TriggerExecutionListResponse = {
  items: TriggerExecution[]
}
