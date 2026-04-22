import { z } from "@hono/zod-openapi";

import { createPublicRoute, createPublicRouter } from "../lib/openapi";

const HealthResponse = z
  .object({
    status: z.literal("ok"),
    requestId: z.string(),
  })
  .openapi("HealthResponse");

const route = createPublicRoute({
  method: "get",
  path: "/",
  tags: ["Meta"],
  summary: "Health check",
  responses: {
    200: {
      description: "Service is up",
      content: {
        "application/json": {
          schema: HealthResponse,
        },
      },
    },
  },
});

export const health = createPublicRouter().openapi(route, (c) => {
  return c.json({ status: "ok" as const, requestId: c.get("requestId") });
});
