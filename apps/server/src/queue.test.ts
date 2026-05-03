/**
 * Queue handler 单测 —— 验证路由 / ack / retry 逻辑，不打 webhook 真 DB。
 *
 * 复杂的 webhook dispatch 行为本身在 webhooks/service.test.ts 已覆盖
 * （真 Neon dev branch + createTestOrg），这里只测 queue 层语义。
 */

import { describe, expect, test, vi } from "vitest";

import type { EventEnvelope } from "./lib/event-queue";
import { createQueueHandler, handleEnvelope } from "./queue";

function makeMsg(envelope: EventEnvelope, attempts = 1) {
  const ack = vi.fn();
  const retry = vi.fn();
  return {
    msg: {
      id: "msg-1",
      timestamp: new Date(),
      body: envelope,
      attempts,
      ack,
      retry,
    },
    ack,
    retry,
  };
}

function makeBatch(messages: ReturnType<typeof makeMsg>[]) {
  return {
    queue: "apollokit-events",
    messages: messages.map((m) => m.msg),
    ackAll: vi.fn(),
    retryAll: vi.fn(),
  } as unknown as MessageBatch<unknown>;
}

function makeCtx() {
  const waitUntil = vi.fn();
  return {
    ctx: { waitUntil, passThroughOnException: vi.fn() } as unknown as ExecutionContext,
    waitUntil,
  };
}

const baseEnvelope: EventEnvelope = {
  name: "task.completed",
  orgId: "org-x",
  payload: { tenantId: "org-x", endUserId: "u-1", taskId: "t-1" },
  capabilities: ["analytics", "webhook"],
  traceId: "trace-abc",
  emittedAt: 1735000000000,
};

describe("handleEnvelope", () => {
  test("routes webhook capability → webhooks.dispatch + ctx.waitUntil(deliverPending)", async () => {
    const dispatch = vi.fn(async () => ({ queued: 2 }));
    const deliverPending = vi.fn(async () => ({
      attempted: 0,
      succeeded: 0,
      failed: 0,
    }));
    const { ctx, waitUntil } = makeCtx();

    await handleEnvelope(
      baseEnvelope,
      { webhooks: { dispatch, deliverPending }, triggers: { evaluate: vi.fn(async () => []) } },
      ctx,
    );

    expect(dispatch).toHaveBeenCalledWith({
      tenantId: "org-x",
      eventType: "task.completed",
      payload: baseEnvelope.payload,
    });
    expect(waitUntil).toHaveBeenCalledTimes(1);
  });

  test("skips deliverPending when no endpoints matched (queued=0)", async () => {
    const dispatch = vi.fn(async () => ({ queued: 0 }));
    const deliverPending = vi.fn(async () => ({
      attempted: 0,
      succeeded: 0,
      failed: 0,
    }));
    const { ctx, waitUntil } = makeCtx();

    await handleEnvelope(
      baseEnvelope,
      { webhooks: { dispatch, deliverPending }, triggers: { evaluate: vi.fn(async () => []) } },
      ctx,
    );

    expect(dispatch).toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
  });

  test("skips webhook path when capability missing", async () => {
    const dispatch = vi.fn(async () => ({ queued: 0 }));
    const deliverPending = vi.fn();
    const evaluate = vi.fn(async () => []);
    const { ctx } = makeCtx();

    await handleEnvelope(
      { ...baseEnvelope, capabilities: ["analytics"] },
      { webhooks: { dispatch, deliverPending }, triggers: { evaluate } },
      ctx,
    );

    expect(dispatch).not.toHaveBeenCalled();
    expect(evaluate).not.toHaveBeenCalled();
  });

  test("routes trigger-rule capability → triggerService.evaluate", async () => {
    const dispatch = vi.fn(async () => ({ queued: 0 }));
    const deliverPending = vi.fn();
    const evaluate = vi.fn(async () => []);
    const { ctx } = makeCtx();

    await handleEnvelope(
      { ...baseEnvelope, capabilities: ["trigger-rule"] },
      { webhooks: { dispatch, deliverPending }, triggers: { evaluate } },
      ctx,
    );

    expect(evaluate).toHaveBeenCalledWith(
      "org-x",
      "task.completed",
      baseEnvelope.payload,
      { traceId: "trace-abc" },
    );
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe("queue (factory) — batch handling", () => {
  test("ack on success", async () => {
    const dispatch = vi.fn(async () => ({ queued: 1 }));
    const deliverPending = vi.fn(async () => ({
      attempted: 0,
      succeeded: 0,
      failed: 0,
    }));
    const queue = createQueueHandler({
      webhooks: { dispatch, deliverPending },
      triggers: { evaluate: vi.fn(async () => []) },
    });
    const m = makeMsg(baseEnvelope);
    const batch = makeBatch([m]);
    const { ctx } = makeCtx();

    await queue(batch, {} as CloudflareBindings, ctx);

    expect(m.ack).toHaveBeenCalledTimes(1);
    expect(m.retry).not.toHaveBeenCalled();
  });

  test("retry with backoff on dispatch failure", async () => {
    const dispatch = vi.fn(async () => {
      throw new Error("boom");
    });
    const deliverPending = vi.fn();
    const queue = createQueueHandler({
      webhooks: { dispatch, deliverPending },
      triggers: { evaluate: vi.fn(async () => []) },
    });
    const m = makeMsg(baseEnvelope, /* attempts */ 1);
    const batch = makeBatch([m]);
    const { ctx } = makeCtx();

    await queue(batch, {} as CloudflareBindings, ctx);

    expect(m.ack).not.toHaveBeenCalled();
    expect(m.retry).toHaveBeenCalledWith({ delaySeconds: 60 });
  });

  test("backoff ladder steps up with attempts", async () => {
    const dispatch = vi.fn(async () => {
      throw new Error("boom");
    });
    const deliverPending = vi.fn();
    const queue = createQueueHandler({
      webhooks: { dispatch, deliverPending },
      triggers: { evaluate: vi.fn(async () => []) },
    });
    const m1 = makeMsg(baseEnvelope, 2);
    const m2 = makeMsg(baseEnvelope, 3);
    const batch = makeBatch([m1, m2]);
    const { ctx } = makeCtx();

    await queue(batch, {} as CloudflareBindings, ctx);

    expect(m1.retry).toHaveBeenCalledWith({ delaySeconds: 300 });
    expect(m2.retry).toHaveBeenCalledWith({ delaySeconds: 1800 });
  });

  test("one failing message does not poison the batch", async () => {
    const dispatch = vi
      .fn<(input: { eventType: string }) => Promise<{ queued: number }>>()
      .mockImplementationOnce(async () => ({ queued: 1 })) // m1 success
      .mockImplementationOnce(async () => {
        throw new Error("boom");
      }); // m2 fails
    const deliverPending = vi.fn(async () => ({
      attempted: 0,
      succeeded: 0,
      failed: 0,
    }));
    const queue = createQueueHandler({
      webhooks: { dispatch, deliverPending },
      triggers: { evaluate: vi.fn(async () => []) },
    });
    const m1 = makeMsg(baseEnvelope);
    const m2 = makeMsg({ ...baseEnvelope, name: "task.claimed" });
    const batch = makeBatch([m1, m2]);
    const { ctx } = makeCtx();

    await queue(batch, {} as CloudflareBindings, ctx);

    expect(m1.ack).toHaveBeenCalled();
    expect(m1.retry).not.toHaveBeenCalled();
    expect(m2.ack).not.toHaveBeenCalled();
    expect(m2.retry).toHaveBeenCalled();
  });
});
