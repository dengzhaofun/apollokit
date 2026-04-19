import { z } from "@hono/zod-openapi";

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

export const UpdateEventCatalogSchema = z
  .object({
    description: z.string().max(2000).nullable().optional().openapi({
      description: "Admin-facing description. Null to clear.",
    }),
    fields: z.array(EventFieldRowSchema).optional().openapi({
      description:
        "Full replacement of the field list. Sets status='canonical' — fields will no longer be merged from future payloads.",
    }),
  })
  .openapi("EventCatalogUpdateBody");

export const EventNameParamSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(128)
    .openapi({ param: { name: "name", in: "path" } }),
});

export const CatalogEventViewSchema = z
  .object({
    name: z.string(),
    source: z.enum(["internal", "external"]),
    owner: z.string().nullable(),
    description: z.string().nullable(),
    fields: z.array(EventFieldRowSchema),
    status: z.enum(["inferred", "canonical"]).nullable(),
    lastSeenAt: z.string().nullable(),
    sampleEventData: z.record(z.string(), z.unknown()).nullable(),
    forwardToTask: z.boolean(),
  })
  .openapi("CatalogEventView");

export const CatalogListResponseSchema = z
  .object({ items: z.array(CatalogEventViewSchema) })
  .openapi("CatalogEventList");

export const ErrorResponseSchema = z
  .object({
    error: z.string(),
    code: z.string().optional(),
    requestId: z.string().optional(),
  })
  .openapi("EventCatalogErrorResponse");

export type UpdateEventCatalogInput = z.input<typeof UpdateEventCatalogSchema>;
