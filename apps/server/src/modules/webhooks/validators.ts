/**
 * Zod schemas for the webhooks module.
 *
 * Used for HTTP request/response validation and service input shape.
 * `.openapi()` metadata surfaces in Scalar `/docs` and the generated SDK.
 */

import { z } from "@hono/zod-openapi";

import { DELIVERY_STATUSES, ENDPOINT_STATUSES } from "./types";

const NameSchema = z.string().min(1).max(200).openapi({
  example: "Ops Slack alerts",
});

/**
 * URL check:
 *   - must parse as URL
 *   - must be https:// unless it's localhost / 127.0.0.1 / *.local
 *     (so dev servers and test doubles still work)
 */
const UrlSchema = z
  .string()
  .url()
  .max(2048)
  .refine(
    (v) => {
      try {
        const u = new URL(v);
        if (u.protocol === "https:") return true;
        if (u.protocol === "http:") {
          return (
            u.hostname === "localhost" ||
            u.hostname === "127.0.0.1" ||
            u.hostname.endsWith(".local")
          );
        }
        return false;
      } catch {
        return false;
      }
    },
    { message: "url must be https (http allowed only for localhost)" },
  )
  .openapi({ example: "https://example.com/webhooks/apollokit" });

/**
 * Each entry is either an exact event type name (`check_in.completed`)
 * or a namespace wildcard (`check_in.*`). Empty array = subscribe to all.
 */
const EventTypeFilterSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z][a-z0-9_]*(\.[a-z0-9_*]+)*$/i, {
    message:
      "event_types entries must look like 'namespace.name' or 'namespace.*'",
  });

export const CreateEndpointSchema = z
  .object({
    name: NameSchema,
    url: UrlSchema,
    description: z.string().max(2000).nullable().optional(),
    eventTypes: z.array(EventTypeFilterSchema).max(50).optional().openapi({
      description:
        "List of subscribed event types. Empty / omitted = subscribe to all events. Wildcard `name.*` matches any event whose type starts with `name.`.",
    }),
  })
  .openapi("CreateWebhookEndpoint");

export const UpdateEndpointSchema = z
  .object({
    name: NameSchema.optional(),
    url: UrlSchema.optional(),
    description: z.string().max(2000).nullable().optional(),
    eventTypes: z.array(EventTypeFilterSchema).max(50).optional(),
    status: z.enum(["active", "disabled"]).optional().openapi({
      description:
        "Admin can flip between `active` and `disabled`. `paused_failing` is auto-set by the delivery loop and cleared by transitioning back to `active`.",
    }),
  })
  .openapi("UpdateWebhookEndpoint");

export type CreateEndpointInput = z.input<typeof CreateEndpointSchema>;
export type UpdateEndpointInput = z.input<typeof UpdateEndpointSchema>;

export const IdParamSchema = z.object({
  id: z.string().min(1).openapi({
    param: { name: "id", in: "path" },
    description: "Webhook endpoint id.",
  }),
});

export const DeliveryIdParamSchema = z.object({
  id: z.string().min(1).openapi({
    param: { name: "id", in: "path" },
    description: "Webhook delivery id.",
  }),
});

export const ListDeliveriesQuerySchema = z.object({
  status: z
    .enum(DELIVERY_STATUSES)
    .optional()
    .openapi({ param: { name: "status", in: "query" } }),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .openapi({ param: { name: "limit", in: "query" } }),
});

// ─── Response shapes ────────────────────────────────────────────────

export const EndpointResponseSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    name: z.string(),
    url: z.string(),
    description: z.string().nullable(),
    eventTypes: z.array(z.string()),
    secretHint: z.string(),
    status: z.enum(ENDPOINT_STATUSES),
    consecutiveFailures: z.number().int(),
    lastSuccessAt: z.string().nullable(),
    lastFailureAt: z.string().nullable(),
    disabledAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("WebhookEndpoint");

export const EndpointWithSecretResponseSchema = EndpointResponseSchema.extend({
  secret: z.string().openapi({
    description: "Plaintext signing secret — shown only once. Store securely.",
    example: "whsec_abc123...",
  }),
}).openapi("WebhookEndpointWithSecret");

export const EndpointListResponseSchema = z
  .object({ items: z.array(EndpointResponseSchema) })
  .openapi("WebhookEndpointList");

export const DeliveryResponseSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    endpointId: z.string(),
    eventId: z.string(),
    eventType: z.string(),
    payload: z.record(z.string(), z.unknown()),
    status: z.enum(DELIVERY_STATUSES),
    attemptCount: z.number().int(),
    nextAttemptAt: z.string().nullable(),
    lastStatusCode: z.number().int().nullable(),
    lastError: z.string().nullable(),
    lastAttemptedAt: z.string().nullable(),
    succeededAt: z.string().nullable(),
    failedAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi("WebhookDelivery");

export const DeliveryListResponseSchema = z
  .object({ items: z.array(DeliveryResponseSchema) })
  .openapi("WebhookDeliveryList");
