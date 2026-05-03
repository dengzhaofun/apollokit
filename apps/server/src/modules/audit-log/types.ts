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

/** Map raw row → public view（去掉 version；ts 序列化为 ISO）。
 *
 * `audit_logs.organization_id` 列为 nullable —— Better Auth `databaseHooks`
 * 写入的 auth 事件(sign-up 时尚未加入 org / sign-out 时 active org 已清掉
 * 等)允许 null。本模块的 list/get 服务始终按 `eq(orgId)` 过滤,**永远不会
 * 返回 null org 的行**,所以这里非空断言安全。需要查 null-org 行的未来
 * "系统级 auth 事件视图"会另开 endpoint,届时再放宽 View 类型。
 */
export function rowToView(row: AuditLogRow): AuditLogView {
  return {
    id: row.id,
    organizationId: row.organizationId!,
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
