/**
 * Billing schema — minimum viable surface for MAU-based pricing.
 *
 *   billing_subscription_plan — catalog of pricing plans
 *                               (mau_quota + overage rate per 1k).
 *
 *   billing_team_subscription — which plan each team is on, and
 *                               when the billing cycle anchors.
 *
 * This is intentionally thin. A future "SaaS subscription" PR will
 * extend it with payment provider linkage (Stripe customer / sub
 * id), add-on quotas, and lifecycle states. For now we own just
 * enough to compute "is this team over quota?" and "what's the
 * overage charge?".
 */

import { sql } from "drizzle-orm";
import {
  date,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { team } from "./auth";

/**
 * Catalog row. Prices stored in **cents** (integer) to avoid
 * floating-point arithmetic on money. `overagePricePerThousand`
 * applies to MAU above `mauQuota` for the cycle.
 */
export const billingSubscriptionPlan = pgTable(
  "billing_subscription_plan",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    // Slug used in admin UI / API; unique across plans.
    slug: text("slug").notNull(),
    mauQuota: integer("mau_quota").notNull(),
    // Cents per 1,000 MAU above quota. Set to 0 for plans that
    // hard-cap at quota instead of allowing overage (uncommon).
    overagePricePer1k: integer("overage_price_per_1k").notNull(),
    // Cents per cycle for the base plan fee. Informational here —
    // actual recurring billing happens via the future payment
    // provider integration.
    basePriceCents: integer("base_price_cents").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (t) => [uniqueIndex("billing_subscription_plan_slug_uidx").on(t.slug)],
);

/**
 * Which plan a team is on. One active subscription per team — the
 * unique constraint enforces it; switching plans is a row update,
 * not a second insert.
 *
 * `billingCycleAnchor` is the day-of-month the cycle resets. For
 * MAU pricing we currently key on the calendar month (year_month
 * derived in UTC), so this column is informational; future
 * non-calendar billing cycles will read it.
 */
export const billingTeamSubscription = pgTable(
  "billing_team_subscription",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    planId: text("plan_id")
      .notNull()
      .references(() => billingSubscriptionPlan.id),
    billingCycleAnchor: date("billing_cycle_anchor").notNull(),
    // 'active' | 'past_due' | 'canceled'. Stored as text (no enum)
    // so adding a new state doesn't require a migration. Alerts
    // and quota enforcement skip non-'active' rows.
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("billing_team_subscription_team_uidx").on(t.teamId),
  ],
);

void sql;
