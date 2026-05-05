
import { env } from "cloudflare:workers";
import { envelopeOf, ok } from "../../lib/response";

import { deps } from "../../deps";
import type { HonoEnv } from "../../env";
import { createAdminRouter, createAdminRoute } from "../../lib/openapi";
import type { TenantPipeName } from "../../lib/analytics";
import { requireAuth } from "../../middleware/require-auth";
import { requirePermissionByMethod } from "../../middleware/require-permission";

import {
  issueTokenBodySchema,
  issueTokenResponseSchema,
} from "./validators";

export const analyticsRouter = createAdminRouter();
analyticsRouter.use("*", requireAuth);
analyticsRouter.use("*", requirePermissionByMethod("analytics"));

const issueTokenRoute = createAdminRoute({
  method: "post",
  path: "/token",
  tags: ["analytics"],
  summary: "Issue a short-lived Tinybird JWT scoped to this tenant",
  description:
    "Returns a JWT the admin UI can hand directly to Tinybird. The " +
    "`org_id` query parameter on each pipe is pinned in the token and " +
    "cannot be overridden by the client.",
  request: {
    body: {
      content: {
        "application/json": { schema: issueTokenBodySchema },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: envelopeOf(issueTokenResponseSchema) },
      },
      description: "Signed JWT",
    },
  },
});

analyticsRouter.openapi(issueTokenRoute, async (c) => {
  const session = c.get("session")!;
  const orgId = session.activeTeamId!;
  const { pipes, ttlSeconds } = c.req.valid("json");

  const token = await deps.analytics.signTenantToken(
    orgId,
    pipes.map((pipe) => ({ pipe: pipe as TenantPipeName })),
    { ttlSeconds },
  );

  const expiresAt = new Date(
    Date.now() + (ttlSeconds ?? 600) * 1000,
  ).toISOString();

  return c.json(ok({
      token,
      expiresAt,
      baseUrl: `${env.TINYBIRD_URL}/v0/pipes`,
      pipes,
    }), 200,);
});

// ─── v1 Data Center endpoints ───────────────────────────────────────
//
// Three project-level endpoints composed from existing services:
//
//   /users/overview     — MAU history + current usage + active-days dist
//   /modules/overview   — per-module quick-look grid
//   /project/overview   — DAU sparkline + activities top-N + funnel
//
// All gated by `requireAuth` + `requirePermissionByMethod("analytics")`
// from the router-level middleware above.

import { z } from "@hono/zod-openapi";
import { commonErrorResponses } from "../../lib/response";
import { activityService } from "../activity";
import { billingService } from "../billing";
import { analyticsService } from "./index";

analyticsRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/users/overview",
    tags: ["analytics"],
    summary: "Project user analytics — MAU history + current usage.",
    description:
      "Composes billing's getCurrentMauUsage with mau_snapshot history. " +
      "DAU time-series and active-days distribution are pulled directly " +
      "from Tinybird by the admin UI via JWT — kept out of this endpoint " +
      "to avoid double-fetching.",
    request: {
      query: z.object({
        months: z.coerce.number().int().min(1).max(24).optional(),
      }),
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(
              z
                .object({
                  current: z.object({
                    yearMonth: z.string(),
                    mau: z.number().int(),
                    quota: z.number().int().nullable(),
                    overage: z.number().int(),
                    overageUnitsPer1k: z.number().int(),
                    projectedOverageCents: z.number().int(),
                    plan: z
                      .object({
                        id: z.string(),
                        name: z.string(),
                        slug: z.string(),
                      })
                      .nullable(),
                    subscriptionStatus: z
                      .enum(["active", "past_due", "canceled"])
                      .nullable(),
                  }),
                  history: z.array(
                    z.object({
                      yearMonth: z.string(),
                      mau: z.number().int(),
                    }),
                  ),
                })
                .openapi("AnalyticsUsersOverview"),
            ),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const session = c.get("session")!;
    const orgId = session.activeTeamId!;
    const { months } = c.req.valid("query");
    const [current, history] = await Promise.all([
      billingService.getCurrentMauUsage(orgId),
      analyticsService.getMauHistory(orgId, months ?? 12),
    ]);
    return c.json(ok({ current, history }), 200);
  },
);

analyticsRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/modules/overview",
    tags: ["analytics"],
    summary: "Per-module quick-look (totalCount + recent24hActivity).",
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(
              z
                .object({
                  items: z.array(
                    z.object({
                      module: z.string(),
                      totalCount: z.number().int(),
                      recent24hActivity: z.number().int(),
                    }),
                  ),
                })
                .openapi("AnalyticsModulesOverview"),
            ),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const session = c.get("session")!;
    const orgId = session.activeTeamId!;
    const result = await analyticsService.getModulesOverview(orgId);
    return c.json(ok(result), 200);
  },
);

analyticsRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/project/overview",
    tags: ["analytics"],
    summary:
      "Project-wide overview — active activities, top activities by participation, membership funnel, MAU.",
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(
              z
                .object({
                  activeActivities: z.number().int(),
                  topActivities: z.array(
                    z.object({
                      alias: z.string(),
                      name: z.string(),
                      participants: z.number().int(),
                    }),
                  ),
                  membershipFunnel: z.object({
                    joined: z.number().int(),
                    completed: z.number().int(),
                    dropped: z.number().int(),
                  }),
                  currentMau: z.object({
                    yearMonth: z.string(),
                    mau: z.number().int(),
                    quota: z.number().int().nullable(),
                  }),
                })
                .openapi("AnalyticsProjectOverview"),
            ),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const session = c.get("session")!;
    const orgId = session.activeTeamId!;

    // Compose: cross-activity top-5 + membership funnel + current MAU.
    const [summary, funnel, mau] = await Promise.all([
      activityService.listActivitiesAnalyticsSummary(orgId, {
        status: "active",
        limit: 50,
      }),
      analyticsService.getMembershipFunnel(orgId),
      billingService.getCurrentMauUsage(orgId),
    ]);

    const topActivities = summary.items
      .slice()
      .sort((a, b) => b.participants - a.participants)
      .slice(0, 5)
      .map((r) => ({
        alias: r.alias,
        name: r.name,
        participants: r.participants,
      }));

    return c.json(
      ok({
        activeActivities: summary.items.length,
        topActivities,
        membershipFunnel: funnel,
        currentMau: {
          yearMonth: mau.yearMonth,
          mau: mau.mau,
          quota: mau.quota,
        },
      }),
      200,
    );
  },
);
