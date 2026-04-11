import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

import type { HonoEnv } from "../env";

const HealthResponse = z
  .object({
    status: z.literal("ok"),
    requestId: z.string(),
  })
  .openapi("HealthResponse");

const route = createRoute({
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

export const health = new OpenAPIHono<HonoEnv>().openapi(route, (c) => {
  return c.json({ status: "ok" as const, requestId: c.get("requestId") });
});
