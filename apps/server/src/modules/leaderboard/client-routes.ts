/**
 * C-end client routes for the leaderboard module.
 *
 * Read-only — the client never publishes scores. Contributions arrive
 * via domain events (task.claimed, level.cleared, activity.milestone.
 * claimed) or via the admin `POST /api/leaderboard/contribute` path.
 *
 * Endpoints:
 *   GET /configs/:alias/top         — top N of the current cycle
 *   GET /configs/:alias/neighbors   — ±window around the caller
 *   GET /configs/:alias/snapshots   — past settled cycles
 *
 * Auth pattern:
 *   requireClientCredential — validates x-api-key (cpk_...), populates
 *                             c.var.clientCredential
 *   requireClientUser       — reads x-end-user-id + x-user-hash headers,
 *                             verifies HMAC, populates c.var.endUserId
 *
 * Handlers read orgId from c.get("clientCredential")!.organizationId and
 * endUserId from c.var.endUserId!. No inline verifyRequest calls; no auth
 * fields in body or query.
 */

import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { requireClientUser } from "../../middleware/require-client-user";
import { ModuleError } from "./errors";
import { leaderboardService } from "./index";
import {
  ErrorResponseSchema,
  SnapshotListResponseSchema,
  TopResponseSchema,
} from "./validators";

const TAG = "Leaderboard (Client)";

import { clientAuthHeaders as authHeaders } from "../../middleware/client-auth-headers";

const errorResponses = {
  400: {
    description: "Bad request",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
  401: {
    description: "Unauthorized",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
  404: {
    description: "Not found",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
};

export const leaderboardClientRouter = new OpenAPIHono<HonoEnv>();

leaderboardClientRouter.use("*", requireClientCredential);
leaderboardClientRouter.use("*", requireClientUser);

leaderboardClientRouter.onError((err, c) => {
  if (err instanceof ModuleError) {
    return c.json(
      { error: err.message, code: err.code, requestId: c.get("requestId") },
      err.httpStatus as ContentfulStatusCode,
    );
  }
  throw err;
});

const AliasParam = z.object({
  alias: z.string().min(1).openapi({ param: { name: "alias", in: "path" } }),
});

const ClientTopQuery = z.object({
  cycleKey: z
    .string()
    .optional()
    .openapi({ param: { name: "cycleKey", in: "query" } }),
  scopeKey: z
    .string()
    .optional()
    .openapi({ param: { name: "scopeKey", in: "query" } }),
  limit: z
    .string()
    .regex(/^\d+$/)
    .optional()
    .transform((v) => (v ? Number(v) : undefined))
    .openapi({ param: { name: "limit", in: "query" } }),
});

const ClientNeighborsQuery = z.object({
  cycleKey: z
    .string()
    .optional()
    .openapi({ param: { name: "cycleKey", in: "query" } }),
  scopeKey: z
    .string()
    .optional()
    .openapi({ param: { name: "scopeKey", in: "query" } }),
  window: z
    .string()
    .regex(/^\d+$/)
    .optional()
    .transform((v) => (v ? Number(v) : 5))
    .openapi({ param: { name: "window", in: "query" } }),
});

leaderboardClientRouter.openapi(
  createRoute({
    method: "get",
    path: "/configs/{alias}/top",
    tags: [TAG],
    summary: "Top N of the current (or specified) cycle, with self rank.",
    request: { headers: authHeaders, params: AliasParam, query: ClientTopQuery },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: TopResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const endUserId = c.var.endUserId!;
    const orgId = c.get("clientCredential")!.organizationId;
    const { cycleKey, scopeKey, limit } = c.req.valid("query");
    const { alias } = c.req.valid("param");
    const result = await leaderboardService.getTop({
      organizationId: orgId,
      configKey: alias,
      cycleKey,
      scopeKey,
      limit,
      endUserId,
    });
    return c.json(result, 200);
  },
);

leaderboardClientRouter.openapi(
  createRoute({
    method: "get",
    path: "/configs/{alias}/neighbors",
    tags: [TAG],
    summary: "Entries above/below the caller within window.",
    request: {
      headers: authHeaders,
      params: AliasParam,
      query: ClientNeighborsQuery,
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: TopResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const endUserId = c.var.endUserId!;
    const orgId = c.get("clientCredential")!.organizationId;
    const { cycleKey, scopeKey, window } = c.req.valid("query");
    const { alias } = c.req.valid("param");
    const result = await leaderboardService.getNeighbors({
      organizationId: orgId,
      configKey: alias,
      endUserId,
      cycleKey,
      scopeKey,
      window,
    });
    return c.json(result, 200);
  },
);

leaderboardClientRouter.openapi(
  createRoute({
    method: "get",
    path: "/configs/{alias}/snapshots",
    tags: [TAG],
    summary: "Past settled snapshots for this leaderboard.",
    request: { headers: authHeaders, params: AliasParam },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: SnapshotListResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const { alias } = c.req.valid("param");
    const rows = await leaderboardService.listSnapshots({
      organizationId: orgId,
      configKey: alias,
    });
    return c.json(
      {
        items: rows.map((r) => ({
          id: r.id,
          configId: r.configId,
          organizationId: r.organizationId,
          cycleKey: r.cycleKey,
          scopeKey: r.scopeKey,
          rankings: r.rankings,
          rewardPlan: r.rewardPlan,
          settledAt: r.settledAt.toISOString(),
        })),
      },
      200,
    );
  },
);
