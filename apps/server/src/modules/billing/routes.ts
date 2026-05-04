/**
 * Admin-facing HTTP surface for the billing module.
 *
 * Exposes three read-only endpoints today:
 *
 *   GET /api/v1/billing/mau/current  → real-time current-cycle
 *                                       MAU + projected overage
 *   GET /api/v1/billing/mau/history  → invoice-grade snapshots
 *                                       (mau_snapshot table)
 *   GET /api/v1/billing/subscription → current plan + status
 *
 * Plan / subscription CRUD is intentionally absent — those land
 * with the future SaaS subscription PR (Stripe linkage,
 * lifecycle states, dunning). For MVP, plan / subscription rows
 * are seeded by ops scripts.
 */

import { createAdminRouter, createAdminRoute } from "../../lib/openapi";
import {
  commonErrorResponses,
  envelopeOf,
  ok,
} from "../../lib/response";
import { getOrgId } from "../../lib/route-context";
import { requireTenantSessionOrApiKey } from "../../middleware/require-tenant-session-or-api-key";
import { billingService } from "./index";
import type { MauSnapshot } from "./types";
import {
  CurrentMauUsageSchema,
  MauHistoryQuerySchema,
  MauHistoryResponseSchema,
  SubscriptionInfoSchema,
} from "./validators";

const TAG = "Billing";

function serializeSnapshot(row: MauSnapshot) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    teamId: row.teamId,
    // periodStart is stored as `date` — drizzle returns a string
    // already (YYYY-MM-DD). Pass through unchanged.
    periodStart: row.periodStart,
    mau: row.mau,
    source: row.source,
    computedAt: row.computedAt.toISOString(),
  };
}

export const billingRouter = createAdminRouter();

billingRouter.use("*", requireTenantSessionOrApiKey);

billingRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/mau/current",
    tags: [TAG],
    summary:
      "Current-cycle MAU and projected overage for the active project",
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(CurrentMauUsageSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const teamId = getOrgId(c);
    const usage = await billingService.getCurrentMauUsage(teamId);
    return c.json(ok(usage), 200);
  },
);

billingRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/mau/history",
    tags: [TAG],
    summary:
      "Historical monthly-close MAU snapshots (most-recent first)",
    request: { query: MauHistoryQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(MauHistoryResponseSchema),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const teamId = getOrgId(c);
    const { months } = c.req.valid("query");
    const items = await billingService.listSnapshots(teamId, months);
    return c.json(ok({ items: items.map(serializeSnapshot) }), 200);
  },
);

billingRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/subscription",
    tags: [TAG],
    summary: "Current plan + subscription status for the active project",
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(SubscriptionInfoSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const teamId = getOrgId(c);
    const sub = await billingService.getSubscription(teamId);
    return c.json(
      ok({
        teamId: sub.subscription.teamId,
        plan: {
          id: sub.plan.id,
          name: sub.plan.name,
          slug: sub.plan.slug,
          mauQuota: sub.plan.mauQuota,
          overagePricePer1k: sub.plan.overagePricePer1k,
          basePriceCents: sub.plan.basePriceCents,
        },
        status: sub.subscription.status as "active" | "past_due" | "canceled",
        billingCycleAnchor: sub.subscription.billingCycleAnchor,
      }),
      200,
    );
  },
);
