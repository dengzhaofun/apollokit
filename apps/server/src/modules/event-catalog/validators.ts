import { z } from "@hono/zod-openapi";

import {
  EVENT_CAPABILITIES,
  EVENT_KINDS,
} from "../../lib/event-capability";

const EventFieldTypeSchema = z.enum([
  "string",
  "number",
  "boolean",
  "object",
  "array",
  "null",
  "unknown",
]);

export const EventFieldRowSchema = z
  .object({
    path: z.string().min(1).max(256),
    type: EventFieldTypeSchema,
    description: z.string().max(2000).optional(),
    required: z.boolean(),
  })
  .openapi("EventCatalogFieldRow");

export const EventCapabilitySchema = z
  .enum(EVENT_CAPABILITIES)
  .openapi("EventCapability");

export const EventKindSchema = z.enum(EVENT_KINDS).openapi("EventKind");

export const UpdateEventCatalogSchema = z
  .object({
    description: z.string().max(2000).nullable().optional().openapi({
      description: "Admin-facing description. Null to clear.",
    }),
    fields: z.array(EventFieldRowSchema).optional().openapi({
      description:
        "Full replacement of the field list. Sets status='canonical' — fields will no longer be merged from future payloads.",
    }),
    // 外部事件的 capability 不可编辑 —— 这张表里的事件专门给 task 触发用,
    // 不走数据分析,capability 恒为 ["task-trigger"]。见 schema/event-catalog.ts。
  })
  .openapi("EventCatalogUpdateBody");

export const EventNameParamSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(128)
    .openapi({ param: { name: "name", in: "path" } }),
});

/**
 * `GET /` 的 query 参数。按 capability 过滤目录,供 task 选择器 / 漏斗
 * 构造器各取所需。
 */
export const ListEventCatalogQuerySchema = z
  .object({
    capability: EventCapabilitySchema.optional().openapi({
      param: { name: "capability", in: "query" },
      description:
        "Filter events by consumer capability. 'task-trigger' = can drive task.processEvent; 'analytics' = visible in analytics pipes.",
    }),
  })
  .openapi("ListEventCatalogQuery");

export const CatalogEventViewSchema = z
  .object({
    name: z.string(),
    kind: EventKindSchema,
    source: z.enum(["internal", "external", "platform"]),
    owner: z.string().nullable(),
    description: z.string().nullable(),
    fields: z.array(EventFieldRowSchema),
    capabilities: z.array(EventCapabilitySchema),
    status: z.enum(["inferred", "canonical"]).nullable(),
    lastSeenAt: z.string().nullable(),
    sampleEventData: z.record(z.string(), z.unknown()).nullable(),
    forwardToTask: z.boolean(),
  })
  .openapi("CatalogEventView");

export const CatalogListResponseSchema = z
  .object({ items: z.array(CatalogEventViewSchema) })
  .openapi("CatalogEventList");

export type UpdateEventCatalogInput = z.input<typeof UpdateEventCatalogSchema>;
export type ListEventCatalogQuery = z.input<typeof ListEventCatalogQuerySchema>;
