/**
 * Link validators — Zod schemas for the `LinkAction` value object.
 *
 * `LinkActionSchema` is exported and embedded as-is by consuming modules
 * (banner.linkAction, dialogue option.action). Consumers never define their
 * own link shape — everything funnels through this schema so new internal
 * routes added to the registry are instantly available everywhere.
 */

import { z } from "@hono/zod-openapi";

import { INTERNAL_ROUTES, LINK_ROUTE_REGISTRY } from "./registry";

const LinkActionNoneSchema = z
  .object({
    type: z.literal("none"),
  })
  .openapi({
    description: "No-op click.",
  });

const LinkActionExternalSchema = z
  .object({
    type: z.literal("external"),
    url: z
      .string()
      .url()
      .max(2048)
      .refine(
        (u) => u.startsWith("http://") || u.startsWith("https://"),
        { message: "external url must be http(s)" },
      ),
    openIn: z.enum(["_blank", "_self"]).optional(),
  })
  .openapi({
    description: "Open an external URL.",
  });

// We intentionally keep `params` a simple Record<string,string> at the outer
// shape and cross-validate against the registry in the superRefine below.
// Doing it via a discriminated sub-union-per-route would bloat the OpenAPI
// schema to one branch per route — the dynamic refine keeps the published
// contract compact while still giving strong runtime validation.
const LinkActionInternalSchema = z
  .object({
    type: z.literal("internal"),
    route: z
      .enum(INTERNAL_ROUTES as [string, ...string[]])
      .openapi({
        description:
          "One of the registered internal routes. See LINK_ROUTE_REGISTRY.",
      }),
    params: z.record(z.string(), z.string()).optional(),
  })
  .openapi({
    description:
      "Navigate to a registered in-app route. Params are validated per-route " +
      "against the schema declared in LINK_ROUTE_REGISTRY.",
  });

export const LinkActionSchema = z
  .discriminatedUnion("type", [
    LinkActionNoneSchema,
    LinkActionExternalSchema,
    LinkActionInternalSchema,
  ])
  .superRefine((value, ctx) => {
    if (value.type !== "internal") return;
    const def =
      LINK_ROUTE_REGISTRY[value.route as keyof typeof LINK_ROUTE_REGISTRY];
    if (!def) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["route"],
        message: `unknown internal route: ${value.route}`,
      });
      return;
    }
    const parsed = def.paramsSchema.safeParse(value.params ?? {});
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["params", ...issue.path],
          message: issue.message,
        });
      }
    }
  })
  .openapi("LinkAction");

export type LinkActionInput = z.input<typeof LinkActionSchema>;
export type LinkActionOutput = z.output<typeof LinkActionSchema>;
