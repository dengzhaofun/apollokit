import type {
  EventCapability,
  EventKind,
} from "../../lib/event-capability";
import type {
  EffectiveInternalEvent,
  EventFieldSchema,
  InternalEventDescriptor,
} from "../../lib/event-registry";
import type { eventCatalogEntries } from "../../schema/event-catalog";

import type { PlatformEventDescriptor } from "./platform-events";

export type EventCatalogEntry = typeof eventCatalogEntries.$inferSelect;
export type {
  EventFieldRow,
  EventCatalogStatus,
} from "../../schema/event-catalog";
export type {
  EventFieldSchema,
  EventFieldType,
  InternalEventDescriptor,
} from "../../lib/event-registry";
export type { EventCapability, EventKind } from "../../lib/event-capability";

/**
 * 统一的对外视图 —— 4 种来源(internal registry / external DB / HTTP 请求 /
 * platform 事件)都映射到这个形状。HTTP 响应用它序列化,admin UI 也只消费
 * 这个形状。
 *
 * 关系口诀:`kind` 描述**事件从哪来**(4 类),`capabilities` 描述**能干什么**
 *         (task-trigger / analytics),两者正交。
 */
export type CatalogEventView = {
  name: string;
  /** 四种数据来源之一,决定 UI 徽章 + 是否可编辑。 */
  kind: EventKind;
  /** 兼容字段 —— 等价于 kind in ("internal-event","external-event") 的 "internal"/"external" 视图。*/
  source: "internal" | "external" | "platform";
  owner: string | null;
  description: string | null;
  fields: EventFieldSchema[];
  /**
   * 事件能干嘛。task 后台的事件选择器只取含 "task-trigger" 的;
   * 数据分析的选择器取含 "analytics" 的(绝大多数事件都有)。
   */
  capabilities: EventCapability[];
  /** 仅 external: 'inferred' | 'canonical'. 其他 kind 恒为 null。 */
  status: "inferred" | "canonical" | null;
  /** 仅 external: 最近一次收到的时间(ISO 8601)。 */
  lastSeenAt: string | null;
  /** 仅 external: 最近一次的 sample payload。 */
  sampleEventData: Record<string, unknown> | null;
  /**
   * 向后兼容:等价于 `capabilities.includes("task-trigger")`。
   * 新代码直接看 `capabilities`,这个字段留给现有消费方(task 模块、admin UI)
   * 一条平滑迁移路径。
   */
  forwardToTask: boolean;
};

function buildView(
  partial: Omit<CatalogEventView, "forwardToTask">,
): CatalogEventView {
  return {
    ...partial,
    forwardToTask: partial.capabilities.includes("task-trigger"),
  };
}

export function internalToView(
  desc: EffectiveInternalEvent | InternalEventDescriptor,
): CatalogEventView {
  // EffectiveInternalEvent 上 capabilities 必定存在;如果外部传入 raw
  // descriptor(理论上不应该),回退到保守的 ["task-trigger","analytics"]。
  const caps =
    "capabilities" in desc && desc.capabilities && desc.capabilities.length > 0
      ? desc.capabilities
      : (["task-trigger", "analytics"] satisfies EventCapability[]);
  return buildView({
    name: desc.name,
    kind: "internal-event",
    source: "internal",
    owner: desc.owner,
    description: desc.description,
    fields: desc.fields,
    capabilities: caps,
    status: null,
    lastSeenAt: null,
    sampleEventData: null,
  });
}

export function externalToView(row: EventCatalogEntry): CatalogEventView {
  // 外部事件的 capabilities 是常量 —— 这张表只服务 task 触发,不进 Tinybird,
  // 所以 capability 集合永远就是 ["task-trigger"],不需要存 DB。见
  // schema/event-catalog.ts 文件头注释。
  return buildView({
    name: row.eventName,
    kind: "external-event",
    source: "external",
    owner: null,
    description: row.description,
    fields: row.fields,
    capabilities: ["task-trigger"],
    status: row.status as "inferred" | "canonical",
    lastSeenAt: row.lastSeenAt.toISOString(),
    sampleEventData: (row.sampleEventData ?? null) as
      | Record<string, unknown>
      | null,
  });
}

export function platformToView(
  desc: PlatformEventDescriptor,
): CatalogEventView {
  return buildView({
    name: desc.name,
    kind: desc.kind,
    source: "platform",
    owner: desc.owner,
    description: desc.description,
    fields: desc.fields,
    capabilities: desc.capabilities,
    status: null,
    lastSeenAt: null,
    sampleEventData: null,
  });
}
