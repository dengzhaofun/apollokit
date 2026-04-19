import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organization } from "./auth";

/**
 * 外部事件 catalog。
 *
 * 每个 (organizationId, eventName) 一行。首次被 `taskService.processEvent`
 * 收到时用字段推断写入 `status='inferred'`；admin 通过 PATCH 补充描述
 * 或修正字段类型后升级为 `status='canonical'`，之后字段不再被推断覆盖。
 *
 * 内部事件不写这张表 —— 内部事件走 `src/lib/event-registry.ts` 的 runtime
 * registry。这张表只存外部事件。
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
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
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
      table.organizationId,
      table.eventName,
    ),
    index("event_catalog_org_last_seen_idx").on(
      table.organizationId,
      table.lastSeenAt,
    ),
  ],
);
