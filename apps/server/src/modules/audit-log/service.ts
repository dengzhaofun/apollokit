/**
 * Audit-log service —— 只读。所有写入由 `middleware/audit-log.ts` 完成；
 * 此 service **不**导出任何 mutation（append-only 是 v1 不可触碰的合约）。
 *
 * Protocol-agnostic. 见 `apps/server/CLAUDE.md` → "Service layer purity".
 */

import { and, desc, eq, sql } from "drizzle-orm";

import type { AppDeps } from "../../deps";
import {
  buildPageBy,
  clampLimit,
  cursorWhere,
} from "../../lib/pagination";
import { auditLogs } from "../../schema/audit-log";

import { AuditLogNotFound } from "./errors";
import {
  rowToView,
  type AuditLogView,
  type ListAuditLogsFilter,
  type ListAuditLogsResult,
} from "./types";
import { auditLogFilters } from "./validators";

type AuditLogDeps = Pick<AppDeps, "db">;

export function createAuditLogService(deps: AuditLogDeps) {
  const { db } = deps;

  return {
    /**
     * 列出 org 范围内的审计日志。
     *
     * 排序固定为 `(ts DESC, id DESC)` —— 与 `audit_logs_org_ts_idx` 完全对齐，
     * 配合 cursor 翻页实现 O(log n) 单次寻位。
     */
    async list(
      orgId: string,
      filter: ListAuditLogsFilter = {},
    ): Promise<ListAuditLogsResult> {
      const limit = clampLimit(filter.limit);

      const where = and(
        eq(auditLogs.tenantId, orgId),
        auditLogFilters.where(filter as Record<string, unknown>),
        cursorWhere(filter.cursor, auditLogs.ts, auditLogs.id),
      );

      const rawRows = await db
        .select()
        .from(auditLogs)
        .where(where)
        .orderBy(desc(auditLogs.ts), desc(auditLogs.id))
        .limit(limit + 1);

      // `audit_logs.ts` 是事件时间列；`buildPage` 默认按 `createdAt` 字段
      // 取 cursor key，这里用 `buildPageBy` 显式映射到 `ts`。
      const page = buildPageBy(rawRows, limit, (r) => ({
        createdAt: r.ts,
        id: r.id,
      }));

      return {
        items: page.items.map(rowToView),
        nextCursor: page.nextCursor,
      };
    },

    async get(orgId: string, id: string): Promise<AuditLogView> {
      const [row] = await db
        .select()
        .from(auditLogs)
        .where(
          and(eq(auditLogs.tenantId, orgId), eq(auditLogs.id, id)),
        )
        .limit(1);
      if (!row) throw new AuditLogNotFound(id);
      return rowToView(row);
    },

    /**
     * 当前 org 出现过的 distinct `resource_type`。给前端筛选 UI 动态填充
     * select 选项 —— 比维护 36 个值的硬编码枚举健壮（`module:<name>` 形式
     * 的兜底值会自动出现在列表里）。
     *
     * 用 `audit_logs_org_resource_idx` 的最左前缀 `(org, resource_type)`
     * 走 index-only scan，扫的是已唯一化的索引项不是表本身，单 org 下
     * 即使表有几百万行也很快。
     */
    async listResourceTypes(orgId: string): Promise<string[]> {
      const rows = await db
        .selectDistinct({ resourceType: auditLogs.resourceType })
        .from(auditLogs)
        .where(eq(auditLogs.tenantId, orgId))
        .orderBy(auditLogs.resourceType);
      return rows.map((r) => r.resourceType);
    },

    /**
     * 极少用 —— 给测试 / 极端运维场景的"查最近一行" helper。生产代码请走
     * `list({ limit: 1 })`。
     */
    async _latestForTest(orgId: string): Promise<AuditLogView | null> {
      const [row] = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.tenantId, orgId))
        .orderBy(desc(auditLogs.ts), desc(auditLogs.id))
        .limit(1);
      // sql import keeps drizzle-orm tree-shaking it; otherwise unused.
      void sql;
      return row ? rowToView(row) : null;
    },
  };
}

export type AuditLogService = ReturnType<typeof createAuditLogService>;
