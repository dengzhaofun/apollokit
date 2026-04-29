import { afterEach, describe, expect, test, vi } from "vitest";

import { createEventBus } from "../../lib/event-bus";
import {
  __resetRegistryForTests,
  registerEvent,
} from "../../lib/event-registry";

import { installWebhookEventBridge, type WebhookEventSink } from "./event-bridge";

describe("installWebhookEventBridge", () => {
  afterEach(() => __resetRegistryForTests());

  test("forwards events with `webhook` capability to sink", async () => {
    const sink = vi.fn<WebhookEventSink>(async () => {});
    registerEvent({
      name: "task.completed",
      owner: "task",
      description: "",
      fields: [],
      capabilities: ["analytics", "webhook"],
    });
    const bus = createEventBus();
    installWebhookEventBridge(bus, sink);

    await bus.emit("task.completed" as never, {
      organizationId: "org-x",
      endUserId: "user-y",
      taskId: "t-1",
    } as never);

    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith({
      eventName: "task.completed",
      orgId: "org-x",
      payload: expect.objectContaining({
        organizationId: "org-x",
        taskId: "t-1",
      }),
      capabilities: ["analytics", "webhook"],
    });
  });

  test("skips events without `webhook` capability", async () => {
    const sink = vi.fn<WebhookEventSink>(async () => {});
    registerEvent({
      name: "internal.only",
      owner: "test",
      description: "",
      fields: [],
      // 默认派生为 ["task-trigger","analytics"]，没有 webhook
    });
    const bus = createEventBus();
    installWebhookEventBridge(bus, sink);

    await bus.emit("internal.only" as never, {
      organizationId: "org-x",
    } as never);

    expect(sink).not.toHaveBeenCalled();
  });

  test("skips payloads missing organizationId (fail-closed)", async () => {
    const sink = vi.fn<WebhookEventSink>(async () => {});
    registerEvent({
      name: "task.completed",
      owner: "task",
      description: "",
      fields: [],
      capabilities: ["webhook"],
    });
    const bus = createEventBus();
    installWebhookEventBridge(bus, sink);

    await bus.emit("task.completed" as never, { foo: "bar" } as never);

    expect(sink).not.toHaveBeenCalled();
  });

  test("skips non-object payloads", async () => {
    const sink = vi.fn<WebhookEventSink>(async () => {});
    registerEvent({
      name: "task.completed",
      owner: "task",
      description: "",
      fields: [],
      capabilities: ["webhook"],
    });
    const bus = createEventBus();
    installWebhookEventBridge(bus, sink);

    await bus.emit("task.completed" as never, null as never);
    await bus.emit("task.completed" as never, "string-payload" as never);

    expect(sink).not.toHaveBeenCalled();
  });

  test("sink errors are swallowed (do not break emit)", async () => {
    const sink = vi.fn<WebhookEventSink>(async () => {
      throw new Error("dispatch boom");
    });
    registerEvent({
      name: "task.completed",
      owner: "task",
      description: "",
      fields: [],
      capabilities: ["webhook"],
    });
    const bus = createEventBus();
    installWebhookEventBridge(bus, sink);

    await expect(
      bus.emit("task.completed" as never, {
        organizationId: "org-x",
      } as never),
    ).resolves.toBeUndefined();
    expect(sink).toHaveBeenCalled();
  });

  test("only events registered before install are subscribed", async () => {
    // bridge 在 src/index.ts 装配时所有 registerEvent 都跑完，但这里
    // 显式断言：install 之后再 register 的事件不会被订阅 —— 这是装载顺序
    // 隐式约束的正确行为，单测里钉一下避免回归。
    const sink = vi.fn<WebhookEventSink>(async () => {});
    const bus = createEventBus();
    installWebhookEventBridge(bus, sink);

    registerEvent({
      name: "task.completed",
      owner: "task",
      description: "",
      fields: [],
      capabilities: ["webhook"],
    });

    await bus.emit("task.completed" as never, {
      organizationId: "org-x",
    } as never);

    expect(sink).not.toHaveBeenCalled();
  });
});
