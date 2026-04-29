/**
 * In-memory EventQueueProducer，用于 vitest。
 *
 * Production 走 `env.EVENTS_QUEUE.send`（Cloudflare Queues），但 vitest 下
 * `cloudflare:workers` 被 shim 替换，没有真 queue。提供一个 stub 让 bridge
 * 测试既能验证「enqueue 被调用」，也能直接 drain 给 consumer handler 跑
 * 一个进程内 e2e。
 */

import type {
  EventEnvelope,
  EventQueueProducer,
} from "../lib/event-queue";

export type EventQueueStub = EventQueueProducer & {
  /** 已发送过的消息，按发送顺序追加。测试可读取断言。 */
  readonly sent: ReadonlyArray<EventEnvelope>;
  /** 重置 sent 数组，用于多 case 共享 stub 时清场。 */
  reset(): void;
};

export function createEventQueueStub(): EventQueueStub {
  const buffer: EventEnvelope[] = [];
  return {
    async send(msg) {
      buffer.push(msg);
    },
    get sent() {
      return buffer;
    },
    reset() {
      buffer.length = 0;
    },
  };
}
