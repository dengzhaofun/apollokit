/**
 * Kind Registry 纯函数测试 —— 无 DB 依赖。
 *
 * 只验证注册表本身的行为，不涉及 activity 生命周期或 eventBus。那些
 * 在 battle-pass/service.test.ts 里做集成覆盖。
 */
import { afterEach, describe, expect, test } from "vitest";

import type { ActivityKind } from "../types";
import type { ActivityKindHandler } from "./handler";
import { kindRegistry } from "./registry";

function stubHandler(kind: ActivityKind): ActivityKindHandler {
  return {
    kind,
    async loadConfig() {
      return null;
    },
  };
}

describe("kind registry", () => {
  // 每个测试后清掉注册表，避免测试间互相干扰。注意：真正的 battle
  // pass handler 也是在 import 时注册进去的，所以测试结束后要把它
  // 放回去吗？不需要 —— vitest fileParallelism:false，test.ts 跑完后
  // 进程里唯一会再 import battle-pass 的就是 battle-pass 自己的
  // service.test.ts，它会重新触发 barrel 的 register 调用。
  afterEach(() => {
    kindRegistry.__clearForTests();
  });

  test("register + resolve", () => {
    const h = stubHandler("generic");
    kindRegistry.register(h);
    expect(kindRegistry.resolve("generic")).toBe(h);
  });

  test("resolve unknown kind returns undefined", () => {
    expect(kindRegistry.resolve("totally_unknown_kind_xyz")).toBeUndefined();
  });

  test("register twice overwrites (HMR / tests tolerant)", () => {
    const h1 = stubHandler("custom");
    const h2 = stubHandler("custom");
    kindRegistry.register(h1);
    kindRegistry.register(h2);
    expect(kindRegistry.resolve("custom")).toBe(h2);
  });

  test("list returns all registered handlers", () => {
    kindRegistry.register(stubHandler("check_in_only"));
    kindRegistry.register(stubHandler("gacha"));
    const kinds = kindRegistry.list().map((h) => h.kind);
    expect(kinds).toContain("check_in_only");
    expect(kinds).toContain("gacha");
    expect(kinds).toHaveLength(2);
  });
});
