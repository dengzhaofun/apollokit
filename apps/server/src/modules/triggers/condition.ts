/**
 * 条件评估 —— JSONLogic 包装层。
 *
 * 选 JSONLogic（jsonlogic.com）的理由：
 *   - JSON-serializable，admin UI 直接传给后端无需 stringify
 *   - 表达能力够：算术、比较、逻辑、 in、map / filter / reduce
 *   - 0 副作用、无 IO、纯函数 —— 适合 Worker isolate
 *   - 比 jq / cel 更简单，社区有现成 React 编辑器
 *
 * 不允许的：
 *   - 模板字符串里的代码注入 —— JSONLogic 没有 eval / setTimeout / fetch
 *   - 引用外部数据 —— 只能访问 payload 自身字段
 */

import jsonLogic from "json-logic-js";

export type ConditionExpression = unknown; // JSONLogic 任意合法树

/**
 * 评估条件。null/undefined 视为「无条件触发」（返回 true）。
 *
 * 失败 fail-closed：表达式抛错（路径不存在等）按 condition false 处理，
 * 不抛给上层 —— 触发引擎调用方按"条件不满足"逻辑流转。
 */
export function evaluateCondition(
  condition: ConditionExpression | null | undefined,
  payload: Record<string, unknown>,
): boolean {
  if (condition === null || condition === undefined) return true;
  try {
    const result = jsonLogic.apply(condition, payload);
    return Boolean(result);
  } catch {
    return false;
  }
}
