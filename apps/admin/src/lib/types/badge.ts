// Types mirror the server envelope shapes in
// `apps/server/src/modules/badge/validators.ts`. Keep in sync when the
// server schema changes — the generated SDK (PR2) will eventually
// replace this hand-typed surface.

export const BADGE_DISPLAY_TYPES = [
  "dot",
  "number",
  "new",
  "hot",
  "exclamation",
  "gift",
] as const
export type BadgeDisplayType = (typeof BADGE_DISPLAY_TYPES)[number]

export const BADGE_AGGREGATIONS = ["sum", "any", "max", "none"] as const
export type BadgeAggregation = (typeof BADGE_AGGREGATIONS)[number]

export const BADGE_SIGNAL_MATCH_MODES = ["exact", "prefix", "none"] as const
export type BadgeSignalMatchMode = (typeof BADGE_SIGNAL_MATCH_MODES)[number]

export const BADGE_DISMISS_MODES = [
  "auto",
  "manual",
  "version",
  "daily",
  "session",
  "cooldown",
] as const
export type BadgeDismissMode = (typeof BADGE_DISMISS_MODES)[number]

export const BADGE_SIGNAL_MODES = ["set", "add", "clear"] as const
export type BadgeSignalMode = (typeof BADGE_SIGNAL_MODES)[number]

export type BadgeNode = {
  id: string
  organizationId: string
  key: string
  parentKey: string | null
  displayType: string
  displayLabelKey: string | null
  signalMatchMode: string
  signalKey: string | null
  signalKeyPrefix: string | null
  aggregation: string
  dismissMode: string
  dismissConfig: Record<string, unknown> | null
  visibilityRule: Record<string, unknown> | null
  sortOrder: number
  isEnabled: boolean
  createdAt: string
  updatedAt: string
}

export type BadgeNodeList = { items: BadgeNode[] }

export type CreateBadgeNodeInput = {
  key: string
  parentKey?: string | null
  displayType: BadgeDisplayType
  displayLabelKey?: string | null
  signalMatchMode: BadgeSignalMatchMode
  signalKey?: string | null
  signalKeyPrefix?: string | null
  aggregation?: BadgeAggregation
  dismissMode?: BadgeDismissMode
  dismissConfig?: Record<string, unknown> | null
  visibilityRule?: Record<string, unknown> | null
  sortOrder?: number
  isEnabled?: boolean
}

export type UpdateBadgeNodeInput = Partial<CreateBadgeNodeInput>

export type BadgeTreeNode = {
  key: string
  displayType: string
  displayLabelKey: string | null
  count: number
  version: string | null
  firstAppearedAt: string | null
  meta: Record<string, unknown> | null
  tooltipKey: string | null
  children: BadgeTreeNode[]
  explain?: {
    reason: string
    rawSignalCount: number
    aggregation: string
    dismissMode: string
    dismissal?: {
      dismissedAt: string
      dismissedVersion: string | null
      periodKey: string | null
      sessionId: string | null
      stale: boolean
    }
    matchedSignalKeys: string[]
  }
}

export type BadgePreviewResponse = {
  rootKey: string | null
  serverTimestamp: string
  nodes: BadgeTreeNode[]
  rawSignals: Array<{
    signalKey: string
    count: number
    version: string | null
    firstAppearedAt: string | null
    expiresAt: string | null
    meta: Record<string, unknown> | null
    updatedAt: string
  }>
  rawDismissals: Array<{
    nodeKey: string
    dismissedAt: string
    dismissedVersion: string | null
    periodKey: string | null
    sessionId: string | null
  }>
}

export type BadgeTemplate = {
  id: string
  label: string
  description: string
  displayType: string
  aggregation: string
  dismissMode: string
  signalMatchMode: string
  requires: ("signalKey" | "signalKeyPrefix")[]
}

export type BadgeTemplateList = { templates: BadgeTemplate[] }

export type BadgeFromTemplateInput = {
  templateId: string
  key: string
  parentKey?: string | null
  displayLabelKey?: string | null
  signalKey?: string | null
  signalKeyPrefix?: string | null
  sortOrder?: number
}

export type BadgeSignalInput = {
  endUserId: string
  signalKey: string
  mode: BadgeSignalMode
  count?: number
  version?: string | null
  meta?: Record<string, unknown> | null
  tooltipKey?: string | null
  expiresAt?: string | null
}

export type BadgeSignalWriteResult = {
  endUserId: string
  signalKey: string
  count: number
  version: string | null
  firstAppearedAt: string | null
  updatedAt: string
}

export type BadgeSignalRegistryEntry = {
  organizationId: string
  keyPattern: string
  isDynamic: boolean
  label: string
  description: string | null
  exampleMeta: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export type BadgeSignalRegistryList = { items: BadgeSignalRegistryEntry[] }

export type BadgeValidateTreeResult = {
  valid: boolean
  errors: Array<{
    kind: "cycle" | "dangling_parent" | "invalid_binding"
    nodeKey: string
    message: string
  }>
}
