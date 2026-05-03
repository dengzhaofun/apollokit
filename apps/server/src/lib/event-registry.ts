/**
 * 内部领域事件的 runtime registry。
 *
 * 每个 module 在 barrel (`index.ts`) 里调用 `registerEvent({...})`
 * 声明自己 emit 的事件 + 字段样貌。启动时 import barrel 完成注册。
 *
 * 与 `event-bus` 的 `EventMap` 互补:EventMap 给 TypeScript 做编译期
 * payload 检查;registry 提供 runtime 可枚举的 schema,用于 admin API
 * 和 task 的事件桥接。
 *
 * 纯进程内,无多租户维度 —— 内部事件是代码产物,所有租户共享。
 *
 * Capability 模型(见 `event-capability.ts`):
 *   - 每条事件有一组 `capabilities`,当前两个:"task-trigger" / "analytics"
 *   - `forwardToTask` 字段保留作**向后兼容的派生入口**,不用 call site 即刻迁移:
 *       未设或 true  → capabilities = ["task-trigger", "analytics"]
 *       显式 false   → capabilities = ["analytics"]
 *     新代码推荐直接写 `capabilities: [...]`(更直观,且能表达"既不 task 也不
 *     analytics"这种未来可能的边界情况)。显式 `capabilities` 覆盖 `forwardToTask`。
 */

import type { EventCapability } from "./event-capability";

export type EventFieldType =
  | "string"
  | "number"
  | "boolean"
  | "object"
  | "array"
  | "null"
  | "unknown";

export type EventFieldSchema = {
  /** Dot-path, 例 "stats.level"。顶层字段即字段名本身。 */
  path: string;
  type: EventFieldType;
  description?: string;
  required: boolean;
};

export type InternalEventDescriptor = {
  /** 事件名,与 `EventMap` 的 key 对应,例 "level.cleared"。 */
  name: string;
  /** emit 该事件的 module 名,便于 admin 分组。 */
  owner: string;
  /** 面向 admin 的描述。 */
  description: string;
  /**
   * 事件 payload 的字段 schema。被 task 桥接消费的事件必须含
   * `tenantId` 和 `endUserId`(forwarder 会 fail-closed 地过滤)。
   */
  fields: EventFieldSchema[];
  /**
   * 是否把该事件自动桥接到 `taskService.processEvent`。默认 true。
   * 没有 endUserId 的事件(例如 `activity.state.changed`)应该显式设
   * false —— 它们是系统级信号,不代表某个用户的行为。
   *
   * @deprecated 新代码请用 `capabilities` 显式声明。保留此字段为了零成本
   *             兼容现有 20+ call sites;如果 `capabilities` 已显式给出,
   *             此字段被忽略。
   */
  forwardToTask?: boolean;
  /** 事件支持的消费场景。未显式给出时按 `forwardToTask` 派生。 */
  capabilities?: EventCapability[];
};

/**
 * 内部注册表里真实存的形状 —— `capabilities` 已 normalize、必定非空。
 * 对外的 `InternalEventDescriptor` 接口保持两个字段都可选是为了兼容;
 * 内部统一用这个 effective view 消费,避免每次判 undefined。
 */
export type EffectiveInternalEvent = Omit<
  InternalEventDescriptor,
  "capabilities" | "forwardToTask"
> & {
  capabilities: EventCapability[];
  forwardToTask: boolean;
};

const registry = new Map<string, EffectiveInternalEvent>();

/** 把 descriptor 的 forwardToTask 派生成 capabilities。显式 capabilities 优先。 */
function resolveCapabilities(
  desc: InternalEventDescriptor,
): EventCapability[] {
  if (desc.capabilities && desc.capabilities.length > 0) {
    return desc.capabilities;
  }
  const forward = desc.forwardToTask ?? true;
  return forward ? ["task-trigger", "analytics"] : ["analytics"];
}

export function registerEvent(desc: InternalEventDescriptor): void {
  // 重复注册通常来自 HMR 或 测试多次 import barrel —— 取最新覆盖即可。
  // 生产 Workers isolate 每个生命周期只 import 一次,不会真的竞争。
  const capabilities = resolveCapabilities(desc);
  registry.set(desc.name, {
    name: desc.name,
    owner: desc.owner,
    description: desc.description,
    fields: desc.fields,
    capabilities,
    // 派生布尔:capabilities 包含 task-trigger → true
    forwardToTask: capabilities.includes("task-trigger"),
  });
}

export function listInternalEvents(): EffectiveInternalEvent[] {
  return Array.from(registry.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

export function getInternalEvent(
  name: string,
): EffectiveInternalEvent | undefined {
  return registry.get(name);
}

/** 仅供测试使用,生产代码不应调用。 */
export function __resetRegistryForTests(): void {
  registry.clear();
}
