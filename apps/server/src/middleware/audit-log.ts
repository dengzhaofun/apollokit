/**
 * 审计日志自动记录 —— 在每次 admin mutation 请求结束后异步写一行
 * `audit_logs`。
 *
 * 挂载位置：`src/index.ts` 全局 `app.use("*", auditLog)`，**位于 `session` /
 * `requestContext` / `requestLog` 之后**（要读到 `c.var.user` / `traceId`、
 * 也要等 requestLog 把它的 ALS 准备好；顺序对齐 requestLog）。
 *
 * 选择全局而非 per-router：
 *   - 36 个业务模块，per-router 挂会忘一个就漏一类；
 *   - 全局挂 + 内部用 `path/method/status` 过滤就能精确决定要不要写。
 *
 * **过滤规则**：只审计能稳定归属到一个 org 的"管理员对业务资源做的写操作"：
 *   - method ∈ {POST, PUT, PATCH, DELETE}（GET/HEAD 不写，已有 http_requests）
 *   - path 必须以 `/api/` 开头，且**不**进入：
 *       · `/api/auth/*`           Better Auth 自管，第三方授权流程
 *       · `/api/client/*`         end-user 流量，不是管理员操作
 *       · `/api/audit-logs/*`     这个模块只暴露 GET，理论上不会进；保险跳过
 *   - 必须有 `activeOrganizationId`（未认证或没有 active org 时跳过）
 *   - 响应状态：成功（2xx）或业务冲突（409）才写。4xx/5xx（验证失败、auth
 *     失败、role 拒绝、内部错误）已由 `http_requests` 留痕，不污染审计表。
 *
 * **不阻塞响应**：所有 INSERT 走 `c.executionCtx.waitUntil(...)`。Neon HTTP
 * 单条 INSERT 即原子，无事务需求。失败仅 `console.error` —— 审计写库挂掉
 * 不能让用户的 PATCH 跟着挂。
 *
 * **vitest 兼容**：与 `requestLog` 同款 try/catch `c.executionCtx`。Node 跑
 * 单测时拿不到 ExecutionContext，直接 return 跳过审计写入。
 *
 * **service 层补 detail**：本 middleware 在 `next()` 前把空 `AuditDetail`
 * 推进 `auditContext`；service 在 next() 期间调 `withAuditDetail({...})` 写入
 * resourceType / resourceId / before / after。next() 返回后我们读出 store
 * 跟 c.var 合并写库。
 */

import { createMiddleware } from "hono/factory";

import { db } from "../db";
import type { HonoEnv } from "../env";
import { auditContext, type AuditDetail } from "../lib/audit-context";
import { auditLogs } from "../schema/audit-log";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * 不审计这些前缀。`/api/audit-logs` 自身 router 只暴露 GET，理论上不会触发，
 * 但留在白名单避免未来手滑加端点造成审计自反馈。
 */
const SKIP_PATH_RE = /^\/api\/(auth|client|audit-logs)(\/|$)/;

export const auditLog = createMiddleware<HonoEnv>(async (c, next) => {
  const method = c.req.method.toUpperCase();
  const path = new URL(c.req.url).pathname;

  // 只审计 mutation, 且只针对 /api/<module>/...
  const shouldAudit =
    MUTATING_METHODS.has(method) &&
    path.startsWith("/api/") &&
    !SKIP_PATH_RE.test(path);

  if (!shouldAudit) {
    return next();
  }

  // 让 service 层有地方写 detail。所有字段都可选 —— middleware 就算 service
  // 一行没填也能写出元数据级别的审计行。
  const detail: AuditDetail = {};
  await auditContext.run(detail, () => next());

  // service 层显式 skip ⇒ 直接放弃这一行
  if (detail.skip) return;

  const orgId = c.get("session")?.activeOrganizationId ?? null;
  if (!orgId) return; // 未认证 / 没 active org

  const status = c.res.status;
  // 仅成功（2xx）和业务冲突（409）写审计。其它失败已在 http_requests。
  if (status >= 400 && status !== 409) return;

  const user = c.get("user");
  const authMethod = c.get("authMethod");

  const actor =
    authMethod === "session" && user
      ? {
          type: "user" as const,
          id: user.id,
          label: user.email ?? user.name ?? null,
        }
      : authMethod === "admin-api-key"
        ? {
            type: "admin-api-key" as const,
            id: null,
            // v1 还没把 api key id 落到 c.var；先记一个占位 label，
            // v2 在 require-admin-or-api-key 里塞 c.var.apiKeyId 后再补。
            label: "admin-api-key",
          }
        : {
            type: "system" as const,
            id: null,
            label: null,
          };

  // method → 默认动作；service 可通过 detail.action 覆盖
  const defaultAction =
    method === "POST" ? "create" : method === "DELETE" ? "delete" : "update";
  const action = detail.action ?? defaultAction;

  // resourceType 兜底：从 path 第二段（`/api/<name>/...`）推断
  const moduleSegment = path.split("/")[2] ?? "unknown";
  const resourceType = detail.resourceType ?? `module:${moduleSegment}`;

  const row = {
    organizationId: orgId,
    actorType: actor.type,
    actorId: actor.id,
    actorLabel: actor.label,
    resourceType,
    resourceId: detail.resourceId ?? null,
    resourceLabel: detail.resourceLabel ?? null,
    action,
    method,
    path,
    status,
    traceId: c.get("requestId") ?? null,
    ip: c.req.header("cf-connecting-ip") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
    before: detail.before ?? null,
    after: detail.after ?? null,
    metadata: detail.metadata ?? null,
  };

  // workerd-only API；vitest 跑 `app.request(...)` 时 throw —— 跳过即可。
  let ec: typeof c.executionCtx;
  try {
    ec = c.executionCtx;
  } catch {
    return;
  }

  ec.waitUntil(
    db
      .insert(auditLogs)
      .values(row)
      .then(
        () => undefined,
        (err) => {
          // 写审计失败不抛 —— 业务请求已成功响应，不能因为审计抖动反作用。
          console.error("audit-log: insert failed", { path, method, err });
        },
      ),
  );
});
