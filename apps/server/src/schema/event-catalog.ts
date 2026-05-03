import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { team } from "./auth";

/**
 * 外部事件 catalog —— 实际定位是"**task 消费的外部事件目录**"。
 *
 * 这张表里的事件生命周期:
 *   1. 游戏服务端通过 `POST /api/client/task/events` 上报
 *   2. `taskService.processEvent` 拿 eventData 累加 task 进度
 *   3. 同步写这张表做字段推断(schema 记录给 admin 看),`status='inferred'`
 *   4. admin 可以 PATCH 把描述 / 字段补完,升级为 `status='canonical'`
 *
 * **外部事件本体不进 Tinybird**(见 `task/service.ts` 的 processEvent —
 * 只有 task 自己产生的 `task.progress_reported` 信号会写 analytics)。
 * 所以这张表里的条目只服务于 task 触发,不服务数据分析。
 * `capabilities` 字段曾短暂存在,后来移除 —— 因为外部事件的 capability
 * 就是常量 `["task-trigger"]`,存库冗余。统一视图 `CatalogEventView.capabilities`
 * 仍保留,由 `externalToView` 常量填充。
 *
 * TODO(任务后续): 考虑重命名为 `task_event_catalog` / `task_events`,
 * 让表名更精确反映"唯一职责是 task 触发"。当前保留名字避免 import 大规模改动。
 *
 * 每个 (tenantId, eventName) 一行。内部事件不写这张表 —— 内部事件走
 * `src/lib/event-registry.ts` 的 runtime registry。
 */

/**
 * `fields` jsonb 列的单元类型。刻意与 `EventFieldSchema` 分开 ——
 * 后者是跨内外事件的统一表示，这里是 DB 列的 row 形状。二者结构一致
 * 但职责不同，后续需要分别演进时互不牵连。
 */
export type EventFieldRow = {
  path: string;
  type:
    | "string"
    | "number"
    | "boolean"
    | "object"
    | "array"
    | "null"
    | "unknown";
  description?: string;
  required: boolean;
};

export type EventCatalogStatus = "inferred" | "canonical";

export const eventCatalogEntries = pgTable(
  "event_catalog_entries",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    eventName: text("event_name").notNull(),
    /**
     * 'inferred' | 'canonical'. inferred 下字段会被后续事件的推断 merge；
     * canonical 下 admin 是权威，字段只能由 PATCH 改。
     */
    status: text("status").default("inferred").notNull(),
    description: text("description"),
    /** 字段列表，形如 `[{ path, type, description, required }]`。 */
    fields: jsonb("fields").$type<EventFieldRow[]>().default([]).notNull(),
    /** 最近一次事件的 sample payload，便于 admin 参考。 */
    sampleEventData: jsonb("sample_event_data"),
    firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("event_catalog_org_name_uidx").on(
      table.tenantId,
      table.eventName,
    ),
    index("event_catalog_tenant_last_seen_idx").on(
      table.tenantId,
      table.lastSeenAt,
    ),
  ],
);
