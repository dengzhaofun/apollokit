/**
 * 审计 detail 的 per-request 跨层传递管道。
 *
 * 业务 service 是协议无关的（不能 import hono），所以无法直接拿到当前请求的
 * Hono Context；middleware 又跑在 service 之前/之后，看不到 service 内部的
 * 业务变化（before/after diff、人类可读的 resourceLabel）。这两层协作只能
 * 走 `node:async_hooks` 的 AsyncLocalStorage —— 与 `request-context.ts` 同款，
 * 不引入新的依赖。
 *
 * 数据流：
 *
 *   1. `middleware/audit-log.ts` 在每次 mutating 请求开始时分配一个空的
 *      `AuditDetail` 对象，并 `auditContext.run(detail, () => next())`。
 *   2. 业务 service 在写完成后调 `withAuditDetail({ resourceType, ... })`，
 *      把 detail 字段填到 store 里那个共享对象上。**多次调用会浅合并**。
 *   3. middleware 在 `next()` 返回后从 store 读出 detail，连同从 c.var 拿到的
 *      actor/method/path/status 一起 INSERT 到 `audit_logs`。
 *
 * 在 store 之外（vitest 直接 import service、scheduled job 等场景）调用
 * `withAuditDetail` 静默 no-op —— 不抛错，让 service 层无需关心调用上下文。
 *
 * Workers 启用 `nodejs_compat`（见 `wrangler.jsonc`），ALS 可用。
 */

import { AsyncLocalStorage } from "node:async_hooks";

import type { AuditAction, AuditActorType } from "../schema/audit-log";

/**
 * 一次审计行的"业务侧补充字段"。所有字段都是可选 —— middleware 始终能写出
 * 元数据级别的行，service 只在它确实想精确化某条审计时才覆盖。
 */
export interface AuditDetail {
  /** 覆盖 middleware 推断的 `module:<name>`，例如 `cdkey.batch`。 */
  resourceType?: string;
  resourceId?: string;
  /** 操作时刻的人类可读标题（写后状态优先）。 */
  resourceLabel?: string;
  /** 覆盖 middleware 从 method 推断的 `create/update/delete`。 */
  action?: AuditAction;
  /** 操作前的资源快照（白名单序列化后的对象）。 */
  before?: Record<string, unknown> | null;
  /** 操作后的资源快照。 */
  after?: Record<string, unknown> | null;
  /** 自由扩展字段，不参与查询。 */
  metadata?: Record<string, unknown> | null;
  /**
   * 显式跳过本次审计 —— 个别"虽然是 POST 但不想留痕"的端点
   * （e.g. 心跳 / 信号刷新）可以调 `withAuditDetail({ skip: true })`。
   * v1 没有用例，留着以备 v2。
   */
  skip?: boolean;
}

/**
 * 写入 actor 时，middleware 可能拿不到的 type-safe 提示 —— 把 `AuditActorType`
 * 在这里 re-export 一次，业务 service 不需要去 reach 进 `schema/audit-log.ts`。
 */
export type { AuditActorType };

export const auditContext = new AsyncLocalStorage<AuditDetail>();

/**
 * 在 store 内时把 patch 浅合并到当前 detail；store 外时静默忽略。
 *
 * 设计上故意 mutate（而不是返回新对象） —— middleware 持有同一个对象引用，
 * 才能在 `next()` 返回后看到 service 层的写入。
 */
export function withAuditDetail(patch: AuditDetail): void {
  const store = auditContext.getStore();
  if (!store) return;
  Object.assign(store, patch);
}

/**
 * 仅供 middleware / 测试用的低级读取。业务侧请不要消费 —— 审计 detail
 * 的所有权属于 middleware 写入路径，service 只负责生产。
 */
export function readAuditDetail(): AuditDetail | undefined {
  return auditContext.getStore();
}
