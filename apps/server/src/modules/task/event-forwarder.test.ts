import { afterEach, describe, expect, test, vi } from "vitest";

import { createEventBus } from "../../lib/event-bus";
import {
  __resetRegistryForTests,
  registerEvent,
} from "../../lib/event-registry";

import { installTaskEventForwarder } from "./event-forwarder";
import type { TaskService } from "./service";

describe("installTaskEventForwarder", () => {
  afterEach(() => __resetRegistryForTests());

  test("forwards registered event with orgId+endUserId to processEvent", async () => {
    const processEvent = vi.fn(async () => 1);
    const fakeTask = { processEvent } as unknown as TaskService;
    registerEvent({
      name: "level.cleared",
      owner: "level",
      description: "",
      fields: [],
    });
    const bus = createEventBus();
    installTaskEventForwarder(bus, fakeTask);

    await bus.emit("level.cleared" as never, {
      tenantId: "org-x",
      endUserId: "user-y",
      stars: 3,
    } as never);

    expect(processEvent).toHaveBeenCalledTimes(1);
    expect(processEvent).toHaveBeenCalledWith(
      "org-x",
      "user-y",
      "level.cleared",
      expect.objectContaining({ stars: 3 }),
    );
  });

  test("skips events with forwardToTask=false", async () => {
    const processEvent = vi.fn(async () => 1);
    const fakeTask = { processEvent } as unknown as TaskService;
    registerEvent({
      name: "activity.state.changed",
      owner: "activity",
      description: "",
      fields: [],
      forwardToTask: false,
    });
    const bus = createEventBus();
    installTaskEventForwarder(bus, fakeTask);

    await bus.emit("activity.state.changed" as never, {
      tenantId: "org-x",
      activityId: "a-1",
      previousState: "draft",
      newState: "active",
    } as never);

    expect(processEvent).not.toHaveBeenCalled();
  });

  test("skips payloads missing tenantId or endUserId", async () => {
    const processEvent = vi.fn(async () => 1);
    const fakeTask = { processEvent } as unknown as TaskService;
    registerEvent({
      name: "weird.evt",
      owner: "test",
      description: "",
      fields: [],
    });
    const bus = createEventBus();
    installTaskEventForwarder(bus, fakeTask);

    await bus.emit("weird.evt" as never, { foo: "bar" } as never);
    expect(processEvent).not.toHaveBeenCalled();
  });

  test("processEvent exceptions are swallowed (fire-and-forget)", async () => {
    const processEvent = vi.fn(async () => {
      throw new Error("boom");
    });
    const fakeTask = { processEvent } as unknown as TaskService;
    registerEvent({
      name: "level.cleared",
      owner: "level",
      description: "",
      fields: [],
    });
    const bus = createEventBus();
    installTaskEventForwarder(bus, fakeTask);

    // Should not throw despite the handler erroring.
    await expect(
      bus.emit("level.cleared" as never, {
        tenantId: "org-x",
        endUserId: "user-y",
      } as never),
    ).resolves.toBeUndefined();
    expect(processEvent).toHaveBeenCalled();
  });
});
