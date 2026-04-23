import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { organization } from "./auth";

/**
 * Webhook endpoints — org-scoped outbound delivery targets.
 *
 * One row per subscribed endpoint. The signing secret (`whsec_…`) is
 * AES-256-GCM encrypted at rest via `lib/crypto.ts` (key derived from
 * BETTER_AUTH_SECRET) and only returned in plaintext on create / rotate.
 * `secret_hint` keeps a redacted preview (`whsec_abcd…wxyz`) so the admin
 * UI can identify endpoints without decrypting.
 *
 * `event_types` is a subscription filter: empty array means "all events";
 * otherwise a string is matched if it (a) equals an entry or (b) the
 * entry ends with `.*` and is a prefix of the event type.
 *
 * Status transitions:
 *   - `active`         default; dispatch creates deliveries
 *   - `disabled`       admin muted; dispatch skips
 *   - `paused_failing` auto-paused after too many consecutive failures;
 *                      admin must manually re-enable
 */
export const webhooksEndpoints = pgTable(
  "webhooks_endpoints",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url").notNull(),
    description: text("description"),
    eventTypes: jsonb("event_types")
      .$type<string[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    secretCiphertext: text("secret_ciphertext").notNull(),
    secretHint: text("secret_hint").notNull(),
    status: text("status").notNull().default("active"),
    consecutiveFailures: integer("consecutive_failures").default(0).notNull(),
    lastSuccessAt: timestamp("last_success_at"),
    lastFailureAt: timestamp("last_failure_at"),
    disabledAt: timestamp("disabled_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("webhooks_endpoints_org_idx").on(table.organizationId),
    index("webhooks_endpoints_org_status_idx").on(
      table.organizationId,
      table.status,
    ),
  ],
);

/**
 * Webhook delivery queue — one row per (event × endpoint) attempt
 * lifecycle. A single dispatch can fan out into N deliveries (one per
 * matching endpoint); each tracks its own retry state.
 *
 * The primary scan index is the partial `(status, next_attempt_at)
 * WHERE status in ('pending','failed')` — the cron tick picks up due
 * rows using `FOR UPDATE SKIP LOCKED` so overlapping ticks can't
 * double-deliver.
 *
 * Retention: `succeeded` rows are swept after 30d, `dead` rows after
 * 90d (see service.cleanupOldDeliveries). `pending` / `failed` /
 * `in_flight` never age out — they either succeed, hit dead, or get
 * force-replayed.
 */
export const webhooksDeliveries = pgTable(
  "webhooks_deliveries",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    endpointId: uuid("endpoint_id")
      .notNull()
      .references(() => webhooksEndpoints.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").default(0).notNull(),
    nextAttemptAt: timestamp("next_attempt_at").defaultNow(),
    lastStatusCode: integer("last_status_code"),
    lastError: text("last_error"),
    lastAttemptedAt: timestamp("last_attempted_at"),
    succeededAt: timestamp("succeeded_at"),
    failedAt: timestamp("failed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("webhooks_deliveries_due_idx")
      .on(table.status, table.nextAttemptAt)
      .where(sql`status in ('pending', 'failed')`),
    index("webhooks_deliveries_org_event_type_idx").on(
      table.organizationId,
      table.eventType,
    ),
    index("webhooks_deliveries_endpoint_created_idx").on(
      table.endpointId,
      table.createdAt,
    ),
  ],
);

export type WebhooksEndpoint = typeof webhooksEndpoints.$inferSelect;
export type WebhooksDelivery = typeof webhooksDeliveries.$inferSelect;
