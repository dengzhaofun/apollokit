/**
 * MAU (monthly active users) schema — three tables:
 *
 *   mau_active_player  — source of truth for "this end-user touched
 *                        this team this month". One row per
 *                        (team_id, eu_user_id, year_month). Inserted
 *                        on the hot path via INSERT ON CONFLICT DO
 *                        NOTHING; never updated, never deleted (history
 *                        is immutable for billing reasons).
 *
 *   mau_snapshot       — immutable invoice-grade rollup written by
 *                        the month-1 cron. Holds the COUNT(*) we
 *                        billed against. We never recompute these
 *                        post-hoc — even if `mau_active_player` is
 *                        re-aggregated later, snapshots are the
 *                        contractual record.
 *
 *   mau_alert          — dedup log for usage-threshold notifications
 *                        (80 / 100 / 150 % of plan quota). One row
 *                        per (team, year_month, threshold) so the
 *                        hourly cron only emails / pages once per
 *                        threshold per month.
 *
 * Tracking covers end users (game players), NOT admin users — the
 * billable signal is `c.var.endUserId`, not `c.var.user`.
 */

import { sql } from "drizzle-orm";
import {
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { team } from "./auth";
import { euUser } from "./end-user-auth";

/**
 * Per (team, eu_user, year_month) row recorded the first time a
 * given end-user touches this team in a given calendar month
 * (month is in UTC; see `currentYearMonth()` in lib/mau/time.ts).
 *
 * `year_month` is stored as text "YYYY-MM" (not a date / int) so
 * the hot path doesn't need server-side date math — the application
 * derives the key in JS once per request and the conflict target
 * is a straight equality.
 */
export const mauActivePlayer = pgTable(
  "mau_active_player",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    euUserId: text("eu_user_id")
      .notNull()
      .references(() => euUser.id, { onDelete: "cascade" }),
    yearMonth: text("year_month").notNull(),
    firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
  },
  (t) => [
    // Conflict target for INSERT ... ON CONFLICT DO NOTHING. The order
    // (team_id, eu_user_id, year_month) also makes this index serve
    // the COUNT(*) WHERE team_id=? AND year_month=? path (its prefix).
    uniqueIndex("mau_active_player_team_user_month_uidx").on(
      t.teamId,
      t.euUserId,
      t.yearMonth,
    ),
    // Used by alerts / billing queries that only need (team, month).
    index("mau_active_player_team_month_idx").on(t.teamId, t.yearMonth),
  ],
);

/**
 * Invoice-grade frozen snapshot. Written by the monthly cron once
 * per (team, period_start, source); never updated post-hoc. The
 * `source` column is in the unique key so an on-demand recompute
 * (e.g. for billing dispute investigation) doesn't overwrite the
 * canonical `monthly_close` row.
 */
export const mauSnapshot = pgTable(
  "mau_snapshot",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id").notNull(),
    teamId: text("team_id").notNull(),
    // Month start in UTC, e.g. 2026-05-01 for "May 2026".
    periodStart: date("period_start").notNull(),
    mau: integer("mau").notNull(),
    // 'monthly_close' = the cron-written canonical snapshot used for
    // invoicing. 'on_demand' = a recompute triggered manually or by
    // a billing dispute investigation; held separately so canonical
    // rows are never overwritten.
    source: text("source").notNull(),
    computedAt: timestamp("computed_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("mau_snapshot_team_period_source_uidx").on(
      t.teamId,
      t.periodStart,
      t.source,
    ),
    index("mau_snapshot_org_period_idx").on(t.organizationId, t.periodStart),
  ],
);

/**
 * Dedup log for plan-quota threshold alerts. One row per (team,
 * year_month, threshold) — the hourly cron checks if the row
 * already exists before sending; this is what stops it from
 * re-paging the team every hour for the rest of the month after
 * they cross 80%.
 *
 * `threshold` is the integer percent (80 / 100 / 150). We don't
 * use an enum so adding a new tier (say 95) doesn't require a
 * migration.
 */
export const mauAlert = pgTable(
  "mau_alert",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    yearMonth: text("year_month").notNull(),
    threshold: integer("threshold").notNull(),
    mauAtTrigger: integer("mau_at_trigger").notNull(),
    quotaAtTrigger: integer("quota_at_trigger").notNull(),
    triggeredAt: timestamp("triggered_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("mau_alert_team_month_threshold_uidx").on(
      t.teamId,
      t.yearMonth,
      t.threshold,
    ),
  ],
);

// `sql` import is required by drizzle-kit even when no explicit
// expressions are used here — the generator inspects the imports.
void sql;
