/**
 * 审计日志（audit_logs）—— 管理后台的"谁、什么时候、对哪个资源、做了什么操作"
 * 单一事实表。append-only：本表对外暴露的 router 没有任何 mutation 端点，
 * 业务侧也禁止 UPDATE / DELETE 此表的行（唯一允许的删除路径是
 * `organization` 级 ON DELETE CASCADE）。
 *
 * 写入路径分两层：
 *
 * 1. **Middleware 自动记录**（v1）—— `middleware/audit-log.ts` 在每次
 *    `/api/<module>/...` 的 `POST/PUT/PATCH/DELETE` 请求结束后通过
 *    `executionCtx.waitUntil` 异步 INSERT 一行，包含元数据骨架：
 *    actor / when / method / path / status / traceId / ip / userAgent。
 *    这一层零侵入地覆盖所有 36 个业务模块。
 *
 * 2. **Service 层 opt-in 补 diff**（v2）—— `lib/audit-context.ts` 暴露
 *    `withAuditDetail({ resourceType, resourceId, before, after, ... })`，
 *    业务 service 在写完成后调用一次以补充人类可读的 resourceType /
 *    resourceId / resourceLabel 与 before/after diff。没补的写操作仍然有
 *    元数据级别记录（`resource_type='module:<name>'`）。
 *
 * 索引选型 —— 列表/筛选最高频的几条访问模式：
 *   - 默认列表：`org_id, ts DESC` 过滤 + 排序
 *   - 资源时间线：`org_id, resource_type, resource_id, ts DESC`
 *   - 个人时间线：`org_id, actor_type, actor_id, ts DESC`
 *   - 按操作筛选：`org_id, action, ts DESC`
 * 都把 `organization_id` 放在最左 —— 单租户查询永远走索引。
 *
 * 不写 Tinybird —— 那边的 `http_requests` 已经够做聚合分析；审计日志的
 * 强诉求是"按用户/资源精确查 + 长期合规留存"，OLAP 不合适。
 */

import {
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { organization } from "./auth";

/** 三种调用方：admin 用户会话、admin API key、系统/cron。 */
export type AuditActorType = "user" | "admin-api-key" | "system";

/**
 * 操作动作 —— middleware 默认从 HTTP method 推断：
 * `POST → create | DELETE → delete | PUT/PATCH → update`。
 * service 层调 `withAuditDetail({ action: "shop.publish" })` 可覆盖为
 * 业务语义的自定义字符串（v2）。列定义为 text 不强制枚举。
 */
export type AuditAction = "create" | "update" | "delete" | (string & {});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** 操作发生的时刻（服务端时钟）。索引列。 */
    ts: timestamp("ts", { withTimezone: true }).defaultNow().notNull(),

    // ── Actor —— 三段式，UI 不需要再 join `user` 表 ─────────────────
    /** 调用方类型：见 `AuditActorType`。 */
    actorType: text("actor_type").notNull(),
    /** user.id 或 apiKey.id；`system` actor 时为 null。 */
    actorId: text("actor_id"),
    /** 调用时刻的人类可读标签 —— email / api key 名。可能为 null。 */
    actorLabel: text("actor_label"),

    // ── Target —— 三段式，service 层可 opt-in 填精确 ───────────────
    /**
     * 资源类型 —— middleware 兜底为 `module:<name>`（从 path 第二段推断），
     * service 层可覆盖为更精确的 `<module>.<resource>`（如 `cdkey.batch`）。
     */
    resourceType: text("resource_type").notNull(),
    /** 资源主键。集合级操作（POST 创建）或未补充时为 null。 */
    resourceId: text("resource_id"),
    /** 操作时刻的人类可读标题/名字（修改后的状态优先）。 */
    resourceLabel: text("resource_label"),

    // ── Action ────────────────────────────────────────────────────
    /** 见 `AuditAction`。值为字符串，不强制枚举，便于自定义动作。 */
    action: text("action").notNull(),

    // ── 请求上下文 —— 与 Tinybird `http_requests` 通过 traceId 关联 ──
    method: text("method").notNull(),
    path: text("path").notNull(),
    status: integer("status").notNull(),
    traceId: text("trace_id"),
    ip: text("ip"),
    userAgent: text("user_agent"),

    // ── Diff payload —— v1 多数为 null；v2 service 层补全 ─────────
    before: jsonb("before").$type<Record<string, unknown> | null>(),
    after: jsonb("after").$type<Record<string, unknown> | null>(),
    /** 自定义扩展字段，**不应**用于查询条件（无索引）。 */
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),

    /** 行 schema 版本号，未来 diff 格式调整时用来分流。 */
    version: smallint("version").default(1).notNull(),
  },
  (table) => [
    // 默认列表 —— 按 ts DESC 翻页（cursor pagination 也走这个索引）
    index("audit_logs_org_ts_idx").on(table.organizationId, table.ts.desc()),
    // 资源时间线
    index("audit_logs_org_resource_idx").on(
      table.organizationId,
      table.resourceType,
      table.resourceId,
      table.ts.desc(),
    ),
    // 个人时间线
    index("audit_logs_org_actor_idx").on(
      table.organizationId,
      table.actorType,
      table.actorId,
      table.ts.desc(),
    ),
    // 按 action 筛
    index("audit_logs_org_action_idx").on(
      table.organizationId,
      table.action,
      table.ts.desc(),
    ),
  ],
);

export type AuditLogRow = typeof auditLogs.$inferSelect;
export type AuditLogInsert = typeof auditLogs.$inferInsert;
