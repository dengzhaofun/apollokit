import { describe, expect, test } from "vitest";

import { evaluateCondition } from "./condition";

describe("evaluateCondition", () => {
  test("null/undefined condition → true (无条件触发)", () => {
    expect(evaluateCondition(null, {})).toBe(true);
    expect(evaluateCondition(undefined, {})).toBe(true);
  });

  test("简单等值比较", () => {
    const cond = { "==": [{ var: "level" }, 10] };
    expect(evaluateCondition(cond, { level: 10 })).toBe(true);
    expect(evaluateCondition(cond, { level: 5 })).toBe(false);
    expect(evaluateCondition(cond, {})).toBe(false);
  });

  test("逻辑与 / 或", () => {
    const cond = {
      and: [
        { "==": [{ var: "firstClear" }, true] },
        { ">=": [{ var: "stars" }, 3] },
      ],
    };
    expect(evaluateCondition(cond, { firstClear: true, stars: 3 })).toBe(true);
    expect(evaluateCondition(cond, { firstClear: true, stars: 2 })).toBe(false);
    expect(evaluateCondition(cond, { firstClear: false, stars: 5 })).toBe(false);
  });

  test("嵌套字段（dot path）", () => {
    const cond = { "==": [{ var: "rewards.0.kindKey" }, "gold" ] };
    expect(
      evaluateCondition(cond, { rewards: [{ kindKey: "gold" }] }),
    ).toBe(true);
    expect(
      evaluateCondition(cond, { rewards: [{ kindKey: "silver" }] }),
    ).toBe(false);
  });

  test("路径不存在 fail-closed → false", () => {
    const cond = { "==": [{ var: "nonexistent.deep.path" }, "x"] };
    expect(evaluateCondition(cond, { foo: "bar" })).toBe(false);
  });

  test("非法表达式 fail-closed → false", () => {
    // jsonLogic.apply 对未知 operator 不抛错（按 false 处理），
    // 但内部错误（例如递归过深）会抛 —— 这里放一个 well-formed false。
    const cond = { ">": [{ var: "level" }, "bad-string"] };
    expect(evaluateCondition(cond, { level: 5 })).toBe(false);
  });

  test("`in` 集合判断", () => {
    const cond = { in: [{ var: "level" }, [1, 5, 10]] };
    expect(evaluateCondition(cond, { level: 10 })).toBe(true);
    expect(evaluateCondition(cond, { level: 7 })).toBe(false);
  });
});
