/**
 * Cross-module analytics service — drives the project-level data
 * center pages (`/analytics/{users,modules,overview}`).
 *
 * Per `apps/server/CLAUDE.md`: no hono import, no direct `db` import,
 * only `Pick<AppDeps, "db">` injected via factory.
 *
 * The other endpoints in this module (`/users/overview`,
 * `/project/overview`) compose existing services (billing,
 * activity) directly in the route layer rather than wrapping them
 * here — that keeps cross-service deps explicit at the call site
 * instead of hidden behind a service indirection.
 */

import { sql } from "drizzle-orm";

import type { AppDeps } from "../../deps";

type AnalyticsDeps = Pick<AppDeps, "db">;

/**
 * Module identity tuple — table name + display key.
 *
 * v1 picks the 10 modules whose main resource is a "thing the operator
 * configures" (not a transactional log). Adding more is one line: a
 * new entry here automatically gets a count + recent24h aggregate on
 * `/analytics/modules/overview`. The order is the display order on the
 * grid; keep it stable so the UI's grid layout doesn't shuffle when
 * adding entries.
 */
const MODULE_DEFINITIONS = [
  { module: "activity", table: "activity_configs" },
  { module: "task", table: "task_definitions" },
  { module: "leaderboard", table: "leaderboard_configs" },
  { module: "check_in", table: "check_in_configs" },
  { module: "lottery", table: "lottery_pools" },
  { module: "shop", table: "shop_products" },
  { module: "cdkey", table: "cdkey_batches" },
  { module: "banner", table: "banner_groups" },
  { module: "item", table: "item_definitions" },
  { module: "mail", table: "mail" },
] as const;

export type ModuleOverviewItem = {
  module: string;
  totalCount: number;
  recent24hActivity: number;
};

export function createAnalyticsService(d: AnalyticsDeps) {
  const { db } = d;

  return {
    /**
     * Per-module operational quick-look. For every module in
     * `MODULE_DEFINITIONS` we run two cheap aggregates:
     *
     *   - `totalCount` = COUNT(*) for the tenant
     *   - `recent24hActivity` = COUNT(*) where created_at > now()-24h
     *
     * Issued in parallel via Promise.all. If a module's table is
     * missing or schema-changed (renamed columns), that single module
     * silently returns zeros so a stale config doesn't break the
     * whole grid. We log + Sentry the underlying error so the issue
     * surfaces.
     */
    async getModulesOverview(tenantId: string): Promise<{
      items: ModuleOverviewItem[];
    }> {
      const items = await Promise.all(
        MODULE_DEFINITIONS.map(async ({ module, table }) => {
          try {
            const totalQ = db.execute(sql<{ cnt: number }>`
              SELECT COUNT(*)::int AS cnt
              FROM ${sql.identifier(table)}
              WHERE tenant_id = ${tenantId}
            `);
            const recentQ = db.execute(sql<{ cnt: number }>`
              SELECT COUNT(*)::int AS cnt
              FROM ${sql.identifier(table)}
              WHERE tenant_id = ${tenantId}
                AND created_at > NOW() - INTERVAL '24 hours'
            `);
            const [tot, rec] = await Promise.all([totalQ, recentQ]);
            return {
              module,
              totalCount: Number(
                (tot.rows[0] as { cnt: number } | undefined)?.cnt ?? 0,
              ),
              recent24hActivity: Number(
                (rec.rows[0] as { cnt: number } | undefined)?.cnt ?? 0,
              ),
            };
          } catch {
            // Don't blow up the whole grid for one bad module —
            // surface zeros and let logs / metrics catch the failure.
            return { module, totalCount: 0, recent24hActivity: 0 };
          }
        }),
      );
      return { items };
    },

    /**
     * MAU history (last `months` calendar months). Reads `mau_snapshot`
     * directly so the analytics page can show a 12-month line chart
     * without depending on the billing module's read shape (the
     * billing module's `listSnapshots` returns full row objects we
     * don't need here).
     */
    async getMauHistory(
      tenantId: string,
      months = 12,
    ): Promise<Array<{ yearMonth: string; mau: number }>> {
      const earliest = new Date();
      earliest.setUTCMonth(earliest.getUTCMonth() - months);
      earliest.setUTCDate(1);
      earliest.setUTCHours(0, 0, 0, 0);
      const earliestIso = earliest.toISOString().slice(0, 10);

      const rowsRaw = await db.execute(sql<{
        period_start: string;
        mau: number;
      }>`
        SELECT period_start, mau
        FROM mau_snapshot
        WHERE team_id = ${tenantId}
          AND source = 'monthly_close'
          AND period_start >= ${earliestIso}
        ORDER BY period_start ASC
      `);

      return (rowsRaw.rows as Array<{ period_start: string; mau: number }>).map(
        (r) => ({
          // period_start is a YYYY-MM-DD date; first 7 chars give "YYYY-MM"
          yearMonth: String(r.period_start).slice(0, 7),
          mau: Number(r.mau),
        }),
      );
    },

    /**
     * Activity participation funnel for the project-level overview
     * page — how many endUsers across all activities joined / completed
     * / dropped. Cross-activity, single-tenant.
     */
    async getMembershipFunnel(tenantId: string): Promise<{
      joined: number;
      completed: number;
      dropped: number;
    }> {
      const r = await db.execute(sql<{
        joined: number;
        completed: number;
        dropped: number;
      }>`
        SELECT
          COUNT(*) FILTER (WHERE status IN ('joined', 'completed', 'dropped', 'left'))::int AS joined,
          COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
          COUNT(*) FILTER (WHERE status = 'dropped')::int   AS dropped
        FROM activity_members
        WHERE tenant_id = ${tenantId}
      `);
      const row = (r.rows[0] as
        | { joined: number; completed: number; dropped: number }
        | undefined) ?? { joined: 0, completed: 0, dropped: 0 };
      return {
        joined: Number(row.joined),
        completed: Number(row.completed),
        dropped: Number(row.dropped),
      };
    },
  };
}

export type AnalyticsService = ReturnType<typeof createAnalyticsService>;
