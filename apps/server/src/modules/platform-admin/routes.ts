/**
 * Platform-operator HTTP surface (`/api/v1/platform/*`).
 *
 * Cross-tenant data — guarded by `requirePlatformAdmin`. Apollo Kit
 * staff use these endpoints to monitor all customers' MAU / overage
 * in one place; ordinary tenant admins get 403 here and use
 * `/api/v1/billing/*` instead (their own scope).
 *
 * First version exposes only the MAU rollup. Future surface (users
 * list, ban/unban UI, audit timeline) will land alongside but is
 * intentionally absent for now.
 */

import { createAdminRouter, createAdminRoute } from "../../lib/openapi";
import {
  commonErrorResponses,
  envelopeOf,
  ok,
} from "../../lib/response";
import { requirePlatformAdmin } from "../../middleware/require-platform-admin";
import { platformAdminService } from "./index";
import type { PlatformTeamUsageRow } from "./types";
import {
  PlatformMauQuerySchema,
  PlatformMauResponseSchema,
} from "./validators";

const TAG = "Platform";

export const platformAdminRouter = createAdminRouter();

platformAdminRouter.use("*", requirePlatformAdmin);

/**
 * Sort + filter the in-memory rows. Done here (not SQL) because the
 * derived overage columns are computed by the service layer — see
 * the file-header note in service.ts.
 */
function applySortAndFilter(
  rows: PlatformTeamUsageRow[],
  query: { sortBy: string; sortDir: "asc" | "desc"; q?: string },
): PlatformTeamUsageRow[] {
  let out = rows;

  if (query.q) {
    const needle = query.q.toLowerCase();
    out = out.filter(
      (r) =>
        r.organizationName.toLowerCase().includes(needle) ||
        r.teamName.toLowerCase().includes(needle),
    );
  }

  const dir = query.sortDir === "asc" ? 1 : -1;
  const cmp = (a: PlatformTeamUsageRow, b: PlatformTeamUsageRow): number => {
    switch (query.sortBy) {
      case "organizationName":
        return a.organizationName.localeCompare(b.organizationName) * dir;
      case "teamName":
        return a.teamName.localeCompare(b.teamName) * dir;
      case "mau":
        return (a.mau - b.mau) * dir;
      case "overage":
        return (a.overage - b.overage) * dir;
      case "projectedOverageCents":
        return (
          (a.projectedOverageCents - b.projectedOverageCents) * dir
        );
      default:
        return 0;
    }
  };
  // Tie-break by teamId so the order is stable across renders even
  // when the primary sort key produces ties (very common for `mau=0`).
  return [...out].sort((a, b) => {
    const primary = cmp(a, b);
    if (primary !== 0) return primary;
    return a.teamId.localeCompare(b.teamId);
  });
}

platformAdminRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/billing/mau",
    tags: [TAG],
    summary:
      "Cross-tenant MAU + overage breakdown for the current calendar month",
    description:
      "Returns one row per Better Auth team. Includes teams with no subscription and teams with no current-month activity (mau=0). Sorted in-memory after MAU is materialized.",
    request: { query: PlatformMauQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(PlatformMauResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const { sortBy, sortDir, q } = c.req.valid("query");
    const { yearMonth, rows } = await platformAdminService.listTeamMauUsage();
    const items = applySortAndFilter(rows, { sortBy, sortDir, q });

    // Totals reflect the FILTERED set so the dashboard's summary
    // numbers match what the operator actually sees in the table.
    const totals = items.reduce(
      (acc, r) => ({
        teams: acc.teams + 1,
        mau: acc.mau + r.mau,
        projectedOverageCents:
          acc.projectedOverageCents + r.projectedOverageCents,
      }),
      { teams: 0, mau: 0, projectedOverageCents: 0 },
    );

    return c.json(ok({ yearMonth, items, totals }));
  },
);
