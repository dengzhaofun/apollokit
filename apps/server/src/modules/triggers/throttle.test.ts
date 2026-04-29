import { afterEach, describe, expect, test, vi } from "vitest";

import type { Redis } from "@upstash/redis/cloudflare";

import { createThrottler } from "./throttle";

function makeFakeRedis(initial: Record<string, number> = {}) {
  const store = new Map<string, number>(Object.entries(initial));
  const incr = vi.fn(async (key: string) => {
    const next = (store.get(key) ?? 0) + 1;
    store.set(key, next);
    return next;
  });
  const expire = vi.fn(async () => 1);
  return { incr, expire, store } as unknown as Redis & { store: Map<string, number> };
}

afterEach(() => vi.useRealTimers());

describe("throttler.check", () => {
  test("无节流配置 → 总是 allowed", async () => {
    const redis = makeFakeRedis();
    const t = createThrottler({ redis });
    const r = await t.check({
      ruleId: "rule-1",
      orgId: "org-1",
      throttle: null,
    });
    expect(r.allowed).toBe(true);
  });

  test("perUserPerMinute 超限 → 拒绝", async () => {
    const redis = makeFakeRedis();
    const t = createThrottler({ redis });
    const input = {
      ruleId: "rule-1",
      orgId: "org-1",
      endUserId: "user-1",
      throttle: { perUserPerMinute: 2 },
      now: new Date("2026-01-01T00:00:00Z"),
    };
    expect((await t.check(input)).allowed).toBe(true);
    expect((await t.check(input)).allowed).toBe(true);
    const r3 = await t.check(input);
    expect(r3.allowed).toBe(false);
    expect(r3.limitedBy).toBe("perUserPerMinute");
  });

  test("缺 endUserId 时 perUser* 限制被忽略", async () => {
    const redis = makeFakeRedis();
    const t = createThrottler({ redis });
    const input = {
      ruleId: "rule-1",
      orgId: "org-1",
      throttle: { perUserPerMinute: 1 },
      now: new Date("2026-01-01T00:00:00Z"),
    };
    expect((await t.check(input)).allowed).toBe(true);
    expect((await t.check(input)).allowed).toBe(true);
  });

  test("perOrg 限制独立于 endUserId", async () => {
    const redis = makeFakeRedis();
    const t = createThrottler({ redis });
    const baseInput = {
      ruleId: "rule-1",
      orgId: "org-1",
      throttle: { perOrgPerMinute: 2 },
      now: new Date("2026-01-01T00:00:00Z"),
    };
    expect(
      (await t.check({ ...baseInput, endUserId: "user-a" })).allowed,
    ).toBe(true);
    expect(
      (await t.check({ ...baseInput, endUserId: "user-b" })).allowed,
    ).toBe(true);
    const r3 = await t.check({ ...baseInput, endUserId: "user-c" });
    expect(r3.allowed).toBe(false);
    expect(r3.limitedBy).toBe("perOrgPerMinute");
  });

  test("Redis 故障 fail-open（allowed=true）", async () => {
    const incr = vi.fn(async () => {
      throw new Error("redis down");
    });
    const expire = vi.fn();
    const redis = { incr, expire } as unknown as Redis;
    const t = createThrottler({ redis });
    const r = await t.check({
      ruleId: "rule-1",
      orgId: "org-1",
      endUserId: "u-1",
      throttle: { perUserPerMinute: 1 },
    });
    expect(r.allowed).toBe(true);
  });
});
