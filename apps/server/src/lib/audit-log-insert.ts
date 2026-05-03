/**
 * 共享的 `audit_logs` 插入入口。
 *
 * 两个调用面：
 *
 * 1. **业务 mutation middleware** (`middleware/audit-log.ts`) —— 所有
 *    `/api/<module>/*` 的 POST/PUT/PATCH/DELETE 在响应后通过
 *    `executionCtx.waitUntil(insertAuditRow(row))` 异步落库。
 *
 * 2. **Better Auth `databaseHooks.*.after`** (`auth.ts`) —— sign-up /
 *    sign-in / sign-out / 密码变更 / OAuth 账号链接等 auth 事件
 *    `/api/auth/*` 路由不进 audit middleware (middleware 显式 skip),
 *    所以在 hook 里直接 `await insertAuditRow(row)`。
 *
 * 失败永远不抛 —— 业务请求/auth 流程已成功响应,审计写库挂掉不能反作用。
 * 错误用 `console.error` 留痕,与 Tinybird `http_requests` 通过 traceId
 * 仍可对账(http_requests 那边走另一条路径,没有这层依赖)。
 */

import { db } from "../db";
import { auditLogs, type AuditLogInsert } from "../schema/audit-log";

export async function insertAuditRow(row: AuditLogInsert): Promise<void> {
  try {
    await db.insert(auditLogs).values(row);
  } catch (err) {
    console.error("audit-log: insert failed", {
      action: row.action,
      resourceType: row.resourceType,
      organizationId: row.organizationId,
      err,
    });
  }
}
