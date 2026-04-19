import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import { db } from "../../db";
import {
  __resetRegistryForTests,
  registerEvent,
} from "../../lib/event-registry";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";

import { EventCatalogReadOnly } from "./errors";
import { createEventCatalogService } from "./service";

describe("event-catalog service", () => {
  let orgId: string;

  beforeAll(async () => {
    orgId = await createTestOrg("event-catalog");
  });
  afterAll(async () => {
    await deleteTestOrg(orgId);
  });
  afterEach(() => __resetRegistryForTests());

  test("recordExternalEvent inserts new row with inferred fields", async () => {
    const svc = createEventCatalogService({ db });
    await svc.recordExternalEvent(orgId, "purchase", {
      amount: 100,
      currency: "USD",
    });
    const view = await svc.getOne(orgId, "purchase");
    expect(view.source).toBe("external");
    expect(view.status).toBe("inferred");
    expect(view.fields.map((f) => f.path).sort()).toEqual([
      "amount",
      "currency",
    ]);
  });

  test("second event within TTL window is deduped (no write)", async () => {
    const svc = createEventCatalogService({ db });
    const t = new Date("2026-04-19T02:00:00Z");
    await svc.recordExternalEvent(orgId, "dedup_evt", { a: 1 }, t);
    // 同一 svc instance + 同一 ts 窗口内二次调用应被 in-memory TTL 吸收。
    await svc.recordExternalEvent(orgId, "dedup_evt", { b: 2 }, t);
    const view = await svc.getOne(orgId, "dedup_evt");
    expect(view.sampleEventData).toEqual({ a: 1 });
  });

  test("second event outside TTL window merges new fields", async () => {
    const svc = createEventCatalogService({ db });
    const t0 = new Date("2026-04-19T03:00:00Z");
    const t1 = new Date("2026-04-19T03:10:00Z"); // +10 分钟 > 5 分钟 TTL
    await svc.recordExternalEvent(orgId, "merge_evt", { a: 1 }, t0);
    await svc.recordExternalEvent(orgId, "merge_evt", { b: 2 }, t1);
    const view = await svc.getOne(orgId, "merge_evt");
    expect(view.fields.map((f) => f.path).sort()).toEqual(["a", "b"]);
    expect(view.sampleEventData).toEqual({ b: 2 });
  });

  test("canonical status freezes fields against further inference", async () => {
    const svc = createEventCatalogService({ db });
    const t0 = new Date("2026-04-19T04:00:00Z");
    const t1 = new Date("2026-04-19T04:10:00Z");
    await svc.recordExternalEvent(orgId, "canon_evt", { a: 1 }, t0);
    await svc.updateExternal(orgId, "canon_evt", {
      description: "blessed",
      fields: [{ path: "a", type: "number", required: true }],
    });
    await svc.recordExternalEvent(orgId, "canon_evt", { b: 2 }, t1);
    const view = await svc.getOne(orgId, "canon_evt");
    expect(view.status).toBe("canonical");
    expect(view.fields.map((f) => f.path)).toEqual(["a"]); // b 没被加进去
    expect(view.description).toBe("blessed");
  });

  test("internal event shows up in listAll with source=internal", async () => {
    registerEvent({
      name: "level.cleared",
      owner: "level",
      description: "Player clears a level",
      fields: [
        { path: "organizationId", type: "string", required: true },
        { path: "endUserId", type: "string", required: true },
        { path: "levelId", type: "string", required: true },
      ],
    });
    const svc = createEventCatalogService({ db });
    const all = await svc.listAll(orgId);
    const lc = all.find((v) => v.name === "level.cleared");
    expect(lc?.source).toBe("internal");
    expect(lc?.owner).toBe("level");
  });

  test("recordExternalEvent is a no-op when name matches an internal event", async () => {
    registerEvent({
      name: "level.cleared",
      owner: "level",
      description: "",
      fields: [],
    });
    const svc = createEventCatalogService({ db });
    await svc.recordExternalEvent(orgId, "level.cleared", { foo: "bar" });
    // 不应在 DB 里出现 external 行 —— getOne 会从 registry 返回 internal view
    const view = await svc.getOne(orgId, "level.cleared");
    expect(view.source).toBe("internal");
  });

  test("updateExternal on an internal event throws EventCatalogReadOnly", async () => {
    registerEvent({
      name: "level.cleared",
      owner: "level",
      description: "",
      fields: [],
    });
    const svc = createEventCatalogService({ db });
    await expect(
      svc.updateExternal(orgId, "level.cleared", { description: "nope" }),
    ).rejects.toBeInstanceOf(EventCatalogReadOnly);
  });
});
