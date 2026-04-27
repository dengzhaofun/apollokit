/**
 * Wire types for the audit-log admin endpoints. Mirrors
 * `apps/server/src/modules/audit-log/types.ts → AuditLogView`.
 */

export type AuditActorType = "user" | "admin-api-key" | "system"

export interface AuditLog {
  id: string
  organizationId: string
  ts: string
  actorType: AuditActorType | string
  actorId: string | null
  actorLabel: string | null
  resourceType: string
  resourceId: string | null
  resourceLabel: string | null
  action: string
  method: string
  path: string
  status: number
  traceId: string | null
  ip: string | null
  userAgent: string | null
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
}
