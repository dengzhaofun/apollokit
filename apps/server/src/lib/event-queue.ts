/**
 * EventEnvelope — Cloudflare Queues 上传输的事件信封。
 *
 * 进 queue 的不是原始 events.emit() payload，而是包了一层元数据：
 *   - `capabilities` 让 consumer 路由派发（webhook / trigger-rule / …）。
 *   - `traceId` 把 queue 副作用关联回原请求 / cron tick 的 trace。
 *   - `emittedAt` 让审计能区分 enqueue 时刻和 consume 时刻（重试可能有 gap）。
 *
 * 为什么不直接把 EventMap[K] 推上去：consumer 在另一个 isolate 跑，
 * 没有 EventMap 编译期类型，必须用 runtime 元数据驱动派发。
 *
 * 详见 ~/.claude/plans/trigger-polished-lemur.md M2 / M3 段。
 */

import type { EventCapability } from "./event-capability";

export type EventEnvelope = {
  /** Event registry name, e.g. "task.completed". */
  name: string;
  /** Tenant scope. Both webhook subscribers and trigger rules 都按 org 分。 */
  orgId: string;
  /** Original payload from `events.emit()`. */
  payload: Record<string, unknown>;
  /** Snapshot of capabilities at emit time —— consumer 用它路由派发。
   *  M2 只看 "webhook"; M3 加 "trigger-rule" 路径。 */
  capabilities: ReadonlyArray<EventCapability>;
  /** Trace correlation —— queue 消费产生的副作用与原请求 / cron 同 trace。 */
  traceId: string;
  /** Millis since epoch —— enqueue 时刻。 */
  emittedAt: number;
};

/**
 * 抽象的 queue producer。生产环境是 `env.EVENTS_QUEUE`，测试环境是
 * in-memory stub（见 `testing/event-queue-stub.ts`），单测可以直接读
 * `stub.sent` 数组验证 enqueue 行为，无需真 queue。
 */
export type EventQueueProducer = {
  send: (msg: EventEnvelope) => Promise<void>;
};
