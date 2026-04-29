import { afterEach, describe, expect, test, vi } from "vitest";

import { createEventBus } from "./event-bus";
import {
  __resetRegistryForTests,
  registerEvent,
} from "./event-registry";

import { installEventDispatcher, type EventDispatchSink } from "./event-dispatcher";

describe("installEventDispatcher", () => {
  afterEach(() => __resetRegistryForTests());

  test("forwards events with webhook capability to sink", async () => {
    const sink = vi.fn<EventDispatchSink>(async () => {});
    registerEvent({
      name: "task.completed",
      owner: "task",
      description: "",
      fields: [],
      capabilities: ["analytics", "webhook"],
    });
    const bus = createEventBus();
    installEventDispatcher(bus, sink);

    await bus.emit("task.completed" as never, {
      organizationId: "org-x",
      endUserId: "user-y",
      taskId: "t-1",
    } as never);

    expect(sink).toHaveBeenCalledTimes(1);
    // sink 收到的 capabilities 只含 async 子集(webhook),进程内 capability
    // (analytics) 不进 envelope —— consumer 不需要重复处理已经走 waitUntil
    // sink 的 capability。
    expect(sink).toHaveBeenCalledWith({
      eventName: "task.completed",
      orgId: "org-x",
      payload: expect.objectContaining({
        organizationId: "org-x",
        taskId: "t-1",
      }),
      capabilities: ["webhook"],
    });
  });

  test("forwards events with trigger-rule capability to sink", async () => {
    const sink = vi.fn<EventDispatchSink>(async () => {});
    registerEvent({
      name: "level.cleared",
      owner: "level",
      description: "",
      fields: [],
      capabilities: ["analytics", "trigger-rule"],
    });
    const bus = createEventBus();
    installEventDispatcher(bus, sink);

    await bus.emit("level.cleared" as never, {
      organizationId: "org-x",
      endUserId: "user-y",
      level: 10,
    } as never);

    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "level.cleared",
        orgId: "org-x",
        capabilities: ["trigger-rule"],
      }),
    );
  });

  test("merges webhook + trigger-rule into a single envelope (no duplicate sends)", async () => {
    const sink = vi.fn<EventDispatchSink>(async () => {});
    registerEvent({
      name: "task.completed",
      owner: "task",
      description: "",
      fields: [],
      capabilities: ["analytics", "webhook", "trigger-rule"],
    });
    const bus = createEventBus();
    installEventDispatcher(bus, sink);

    await bus.emit("task.completed" as never, {
      organizationId: "org-x",
      endUserId: "user-y",
    } as never);

    // 关键断言:同一事件命中两个 async capability 只产生 1 条 envelope。
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink.mock.calls[0]?.[0].capabilities).toEqual([
      "webhook",
      "trigger-rule",
    ]);
  });

  test("skips events without any async capability", async () => {
    const sink = vi.fn<EventDispatchSink>(async () => {});
    registerEvent({
      name: "internal.only",
      owner: "test",
      description: "",
      fields: [],
      // 默认派生 ["task-trigger","analytics"] —— 都是进程内 capability,
      // 不进 queue。
    });
    const bus = createEventBus();
    installEventDispatcher(bus, sink);

    await bus.emit("internal.only" as never, {
      organizationId: "org-x",
    } as never);

    expect(sink).not.toHaveBeenCalled();
  });

  test("skips payloads missing organizationId (fail-closed)", async () => {
    const sink = vi.fn<EventDispatchSink>(async () => {});
    registerEvent({
      name: "task.completed",
      owner: "task",
      description: "",
      fields: [],
      capabilities: ["webhook"],
    });
    const bus = createEventBus();
    installEventDispatcher(bus, sink);

    await bus.emit("task.completed" as never, { foo: "bar" } as never);

    expect(sink).not.toHaveBeenCalled();
  });

  test("skips non-object payloads", async () => {
    const sink = vi.fn<EventDispatchSink>(async () => {});
    registerEvent({
      name: "task.completed",
      owner: "task",
      description: "",
      fields: [],
      capabilities: ["webhook"],
    });
    const bus = createEventBus();
    installEventDispatcher(bus, sink);

    await bus.emit("task.completed" as never, null as never);
    await bus.emit("task.completed" as never, "string-payload" as never);

    expect(sink).not.toHaveBeenCalled();
  });

  test("sink errors are swallowed (do not break emit)", async () => {
    const sink = vi.fn<EventDispatchSink>(async () => {
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
    installEventDispatcher(bus, sink);

    await expect(
      bus.emit("task.completed" as never, {
        organizationId: "org-x",
      } as never),
    ).resolves.toBeUndefined();
    expect(sink).toHaveBeenCalled();
  });

  test("only events registered before install are subscribed", async () => {
    const sink = vi.fn<EventDispatchSink>(async () => {});
    const bus = createEventBus();
    installEventDispatcher(bus, sink);

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
