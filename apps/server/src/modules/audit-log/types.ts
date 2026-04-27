/**
 * Audit-log domain types.
 *
 * 列表 API 返回的"行视图"故意比表更窄一点 —— `version` 不暴露给前端
 * （内部分流字段），其它列原样返回。`before/after/metadata` 直接以 jsonb
 * 字段透传，给前端 deep-diff 工具消费。
 */

import type { AuditAction, AuditActorType, AuditLogRow } from "../../schema/audit-log";

export type { AuditAction, AuditActorType };

export interface AuditLogView {
  id: string;
  organizationId: string;
  ts: string;
  actorType: AuditActorType | string;
  actorId: string | null;
  actorLabel: string | null;
  resourceType: string;
  resourceId: string | null;
  resourceLabel: string | null;
  action: string;
  method: string;
  path: string;
  status: number;
  traceId: string | null;
  ip: string | null;
  userAgent: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
}

export interface ListAuditLogsResult {
  items: AuditLogView[];
  nextCursor: string | null;
}

/**
 * 服务层接收的过滤入参 —— 直接对应 `auditLogFilters.querySchema` 解析后的
 * 形状（plus cursor/limit/q/adv 由 PaginationQuerySchema 提供）。零反射。
 */
export type ListAuditLogsFilter = {
  cursor?: string;
  limit?: number;
  q?: string;
  adv?: string;
} & Record<string, unknown>;

/** Map raw row → public view（去掉 version；ts 序列化为 ISO）。 */
export function rowToView(row: AuditLogRow): AuditLogView {
  return {
    id: row.id,
    organizationId: row.organizationId,
    ts: row.ts.toISOString(),
    actorType: row.actorType,
    actorId: row.actorId,
    actorLabel: row.actorLabel,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    resourceLabel: row.resourceLabel,
    action: row.action,
    method: row.method,
    path: row.path,
    status: row.status,
    traceId: row.traceId,
    ip: row.ip,
    userAgent: row.userAgent,
    before: row.before ?? null,
    after: row.after ?? null,
    metadata: row.metadata ?? null,
  };
}
