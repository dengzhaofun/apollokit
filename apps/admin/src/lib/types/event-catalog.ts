export type EventFieldType =
  | "string"
  | "number"
  | "boolean"
  | "object"
  | "array"
  | "null"
  | "unknown"

export interface EventFieldRow {
  path: string
  type: EventFieldType
  description?: string
  required: boolean
}

/** Soft 兼容:旧字段,etiam 后端仍然返回。UI 实际用 `kind`。 */
export type EventCatalogSource = "internal" | "external" | "platform"
export type EventCatalogStatus = "inferred" | "canonical"

/** 事件来源分类 —— 见 `apps/server/src/lib/event-capability.ts`。 */
export type EventKind =
  | "internal-event"
  | "external-event"
  | "http-request"
  | "platform-event"

/** 事件消费能力维度 —— 前端构造器按此过滤选项。 */
export type EventCapability =
  | "task-trigger"
  | "analytics"
  | "webhook"
  | "trigger-rule"

export const EVENT_CAPABILITIES: readonly EventCapability[] = [
  "task-trigger",
  "analytics",
  "webhook",
  "trigger-rule",
] as const

export interface CatalogEventView {
  name: string
  /** 事件来源分类(4 种):internal-event / external-event / http-request / platform-event */
  kind: EventKind
  /** 兼容字段,和 kind 冗余。 */
  source: EventCatalogSource
  owner: string | null
  description: string | null
  fields: EventFieldRow[]
  /** 事件能干嘛。task 选择器只取含 "task-trigger" 的。 */
  capabilities: EventCapability[]
  /** null for internal / platform / http-request,'inferred' | 'canonical' for external. */
  status: EventCatalogStatus | null
  lastSeenAt: string | null
  sampleEventData: Record<string, unknown> | null
  /** 兼容字段:等价于 capabilities.includes("task-trigger")。 */
  forwardToTask: boolean
}

export interface CatalogListResponse {
  items: CatalogEventView[]
}

export interface UpdateEventCatalogInput {
  description?: string | null
  fields?: EventFieldRow[]
}
