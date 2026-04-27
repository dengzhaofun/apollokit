/**
 * Audit-log validators —— 复用 `lib/list-filter` 的 DSL，把过滤字段一次声明
 * 后衍生出：服务端 query schema、admin URL fragment、drizzle WHERE 构建器、
 * advanced 模式可用的字段元数据。
 *
 * 字段选型：
 *   - `actorType` enum —— `user | admin-api-key | system`，三种调用方
 *   - `actorId` string —— 精确匹配某个用户 id；admin 自由输入
 *   - `resourceType` string contains —— `module:cdkey` 或 `cdkey.batch` 都能匹
 *   - `resourceId` string eq —— 翻"这条具体资源的时间线"
 *   - `action` string ops —— `eq` 即可（'create' / 'update' / 'delete' / 自定义）
 *   - `method` enum —— HTTP method 多选
 *   - `status` numberRange —— 2xx / 4xx 段筛选
 *   - `ts` dateRange —— 时间窗
 *
 * search（`q`）跨 path / actor_label / resource_label / resource_id 做 ilike，
 * 让"模糊搜索"覆盖最常见的几列；表上没有 trgm 索引（不是搜索热表），
 * 默认 ilike 模式。
 */

import { z } from "@hono/zod-openapi";

import { defineListFilter, f } from "../../lib/list-filter";
import { pageOf } from "../../lib/pagination";
import { auditLogs } from "../../schema/audit-log";

export const auditLogFilters = defineListFilter({
  actorType: f.enumOf(["user", "admin-api-key", "system"], {
    column: auditLogs.actorType,
    label: "Actor type",
  }),
  actorId: f.string({
    column: auditLogs.actorId,
    ops: ["eq", "ne"],
    label: "Actor",
  }),
  resourceType: f.string({
    column: auditLogs.resourceType,
    ops: ["eq", "contains", "beginsWith"],
    label: "Resource type",
  }),
  resourceId: f.string({
    column: auditLogs.resourceId,
    ops: ["eq", "ne"],
    label: "Resource ID",
  }),
  action: f.string({
    column: auditLogs.action,
    ops: ["eq", "contains"],
    label: "Action",
  }),
  method: f.multiEnum(["POST", "PUT", "PATCH", "DELETE"], {
    column: auditLogs.method,
    label: "HTTP method",
  }),
  status: f.numberRange({ column: auditLogs.status, label: "Status" }),
  ts: f.dateRange({ column: auditLogs.ts, label: "Time" }),
})
  .search({
    columns: [
      auditLogs.path,
      auditLogs.actorLabel,
      auditLogs.resourceLabel,
      auditLogs.resourceId,
    ],
    mode: "ilike",
  })
  .build();

export const ListAuditLogsQuerySchema = auditLogFilters.querySchema.openapi(
  "ListAuditLogsQuery",
);

export const AuditLogIdParamSchema = z
  .object({
    id: z.string().uuid().openapi({ example: "8e25b3d8-..." }),
  })
  .openapi("AuditLogIdParam");

export const AuditLogViewSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    ts: z.string(),
    actorType: z.string(),
    actorId: z.string().nullable(),
    actorLabel: z.string().nullable(),
    resourceType: z.string(),
    resourceId: z.string().nullable(),
    resourceLabel: z.string().nullable(),
    action: z.string(),
    method: z.string(),
    path: z.string(),
    status: z.number().int(),
    traceId: z.string().nullable(),
    ip: z.string().nullable(),
    userAgent: z.string().nullable(),
    before: z.record(z.string(), z.unknown()).nullable(),
    after: z.record(z.string(), z.unknown()).nullable(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
  })
  .openapi("AuditLogView");

export const AuditLogListResponseSchema = pageOf(AuditLogViewSchema).openapi(
  "AuditLogListResponse",
);

/**
 * `/resource-types` 返回"当前 org 出现过哪些 resourceType"，给前端筛选 UI
 * 动态填 select 选项。比硬编码 36 个值的枚举健壮。
 */
export const ResourceTypesResponseSchema = z
  .object({
    items: z.array(z.string()),
  })
  .openapi("AuditLogResourceTypes");
