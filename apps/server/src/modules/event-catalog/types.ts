import type {
  EventFieldSchema,
  InternalEventDescriptor,
} from "../../lib/event-registry";
import type { eventCatalogEntries } from "../../schema/event-catalog";

export type EventCatalogEntry = typeof eventCatalogEntries.$inferSelect;
export type { EventFieldRow, EventCatalogStatus } from "../../schema/event-catalog";
export type {
  EventFieldSchema,
  EventFieldType,
  InternalEventDescriptor,
} from "../../lib/event-registry";

/**
 * 统一的对外视图：内部事件（registry）与外部事件（DB 行）都映射到这个形状。
 * HTTP 响应用它序列化，admin UI 也只消费这个形状。
 */
export type CatalogEventView = {
  name: string;
  source: "internal" | "external";
  owner: string | null;
  description: string | null;
  fields: EventFieldSchema[];
  /** 仅 external: 'inferred' | 'canonical'. internal 恒为 null。 */
  status: "inferred" | "canonical" | null;
  /** 仅 external: 最近一次收到的时间（ISO 8601）。 */
  lastSeenAt: string | null;
  /** 仅 external: 最近一次的 sample payload。 */
  sampleEventData: Record<string, unknown> | null;
  /**
   * 是否会被桥接到 task.processEvent。
   * internal 取 registry 的 forwardToTask；external 恒为 true（外部事件
   * 本来就是通过 task 入口进来的）。
   */
  forwardToTask: boolean;
};

export function internalToView(desc: InternalEventDescriptor): CatalogEventView {
  return {
    name: desc.name,
    source: "internal",
    owner: desc.owner,
    description: desc.description,
    fields: desc.fields,
    status: null,
    lastSeenAt: null,
    sampleEventData: null,
    forwardToTask: desc.forwardToTask ?? true,
  };
}

export function externalToView(row: EventCatalogEntry): CatalogEventView {
  return {
    name: row.eventName,
    source: "external",
    owner: null,
    description: row.description,
    fields: row.fields,
    status: row.status as "inferred" | "canonical",
    lastSeenAt: row.lastSeenAt.toISOString(),
    sampleEventData: (row.sampleEventData ?? null) as
      | Record<string, unknown>
      | null,
    forwardToTask: true,
  };
}
