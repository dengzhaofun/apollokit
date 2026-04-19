/**
 * 内部领域事件的 runtime registry。
 *
 * 每个 module 在 barrel (`index.ts`) 里调用 `registerEvent({...})`
 * 声明自己 emit 的事件 + 字段样貌。启动时 import barrel 完成注册。
 *
 * 与 `event-bus` 的 `EventMap` 互补：EventMap 给 TypeScript 做编译期
 * payload 检查；registry 提供 runtime 可枚举的 schema，用于 admin API
 * 和 task 的事件桥接。
 *
 * 纯进程内，无多租户维度 —— 内部事件是代码产物，所有租户共享。
 */

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
  /** 事件名，与 `EventMap` 的 key 对应，例 "level.cleared"。 */
  name: string;
  /** emit 该事件的 module 名，便于 admin 分组。 */
  owner: string;
  /** 面向 admin 的描述。 */
  description: string;
  /**
   * 事件 payload 的字段 schema。被 task 桥接消费的事件必须含
   * `organizationId` 和 `endUserId`（forwarder 会 fail-closed 地过滤）。
   */
  fields: EventFieldSchema[];
  /**
   * 是否把该事件自动桥接到 `taskService.processEvent`。默认 true。
   * 没有 endUserId 的事件（例如 `activity.state.changed`）应该显式设
   * false —— 它们是系统级信号，不代表某个用户的行为。
   */
  forwardToTask?: boolean;
};

const registry = new Map<string, InternalEventDescriptor>();

export function registerEvent(desc: InternalEventDescriptor): void {
  // 重复注册通常来自 HMR 或 测试多次 import barrel —— 取最新覆盖即可。
  // 生产 Workers isolate 每个生命周期只 import 一次，不会真的竞争。
  registry.set(desc.name, {
    ...desc,
    forwardToTask: desc.forwardToTask ?? true,
  });
}

export function listInternalEvents(): InternalEventDescriptor[] {
  return Array.from(registry.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

export function getInternalEvent(
  name: string,
): InternalEventDescriptor | undefined {
  return registry.get(name);
}

/** 仅供测试使用，生产代码不应调用。 */
export function __resetRegistryForTests(): void {
  registry.clear();
}
