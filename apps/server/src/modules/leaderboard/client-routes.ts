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
 * Handlers read orgId from c.get("clientCredential")!.tenantId and
 * endUserId from getEndUserId(c). No inline verifyRequest calls; no auth
 * fields in body or query.
 */

import { z } from "@hono/zod-openapi";
import { commonErrorResponses, envelopeOf, ok } from "../../lib/response";
import { getEndUserId } from "../../lib/route-context";
import type { HonoEnv } from "../../env";
import { createClientRouter, createClientRoute } from "../../lib/openapi";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { requireClientUser } from "../../middleware/require-client-user";
import { leaderboardService } from "./index";
import {
  SnapshotListResponseSchema,
  TopResponseSchema,
} from "./validators";

const TAG = "Leaderboard (Client)";

import { clientAuthHeaders as authHeaders } from "../../middleware/client-auth-headers";

export const leaderboardClientRouter = createClientRouter();

leaderboardClientRouter.use("*", requireClientCredential);
leaderboardClientRouter.use("*", requireClientUser);

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
  createClientRoute({
    method: "get",
    path: "/configs/{alias}/top",
    tags: [TAG],
    summary: "Top N of the current (or specified) cycle, with self rank.",
    request: { headers: authHeaders, params: AliasParam, query: ClientTopQuery },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(TopResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const endUserId = getEndUserId(c);
    const orgId = c.get("clientCredential")!.tenantId;
    const { cycleKey, scopeKey, limit } = c.req.valid("query");
    const { alias } = c.req.valid("param");
    const result = await leaderboardService.getTop({
      tenantId: orgId,
      configKey: alias,
      cycleKey,
      scopeKey,
      limit,
      endUserId,
    });
    return c.json(ok(result), 200);
  },
);

leaderboardClientRouter.openapi(
  createClientRoute({
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
        content: { "application/json": { schema: envelopeOf(TopResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const endUserId = getEndUserId(c);
    const orgId = c.get("clientCredential")!.tenantId;
    const { cycleKey, scopeKey, window } = c.req.valid("query");
    const { alias } = c.req.valid("param");
    const result = await leaderboardService.getNeighbors({
      tenantId: orgId,
      configKey: alias,
      endUserId,
      cycleKey,
      scopeKey,
      window,
    });
    return c.json(ok(result), 200);
  },
);

leaderboardClientRouter.openapi(
  createClientRoute({
    method: "get",
    path: "/configs/{alias}/snapshots",
    tags: [TAG],
    summary: "Past settled snapshots for this leaderboard.",
    request: { headers: authHeaders, params: AliasParam },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(SnapshotListResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.tenantId;
    const { alias } = c.req.valid("param");
    const rows = await leaderboardService.listSnapshots({
      tenantId: orgId,
      configKey: alias,
    });
    return c.json(ok({
        items: rows.map((r) => ({
          id: r.id,
          configId: r.configId,
          tenantId: r.tenantId,
          cycleKey: r.cycleKey,
          scopeKey: r.scopeKey,
          rankings: r.rankings,
          rewardPlan: r.rewardPlan,
          settledAt: r.settledAt.toISOString(),
        })),
      }), 200,);
  },
);
