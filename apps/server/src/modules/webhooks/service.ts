/**
 * Webhooks service — protocol-agnostic business logic.
 *
 * Does NOT import Hono or HTTP machinery. Exposes:
 *   - endpoint CRUD (secrets are AES-256-GCM encrypted at rest)
 *   - `dispatch()` for other modules to fan out an internal event
 *     to every matching endpoint as `webhooks_deliveries` rows
 *   - `deliverPending()` for the cron tick to actually send them
 *   - `replayDelivery()` / `cleanupOldDeliveries()` for ops
 *
 * ─── Concurrency on delivery pickup ────────────────────────────────
 *
 * Neon HTTP has no multi-statement transactions (see app
 * CLAUDE.md). We still need to prevent two overlapping cron ticks
 * from double-posting the same delivery. The trick is to claim rows
 * with a single atomic UPDATE whose WHERE clause demands the row is
 * still in a claimable state:
 *
 *   UPDATE webhooks_deliveries
 *   SET status='in_flight', attempt_count=attempt_count+1,
 *       last_attempted_at=now()
 *   WHERE id = $1
 *     AND status IN ('pending','failed')
 *     AND next_attempt_at <= now()
 *   RETURNING *;
 *
 * Losers (whose row was already claimed by another tick) get zero
 * rows back and skip. We don't need `FOR UPDATE SKIP LOCKED` because
 * each UPDATE is itself the claim.
 *
 * ─── Retry & backoff ───────────────────────────────────────────────
 *
 * 8 attempts total. On each failure the row goes back to `failed` with
 * an increased `next_attempt_at`:
 *
 *   attempt -> wait before next
 *      1    ->   30s
 *      2    ->    2m
 *      3    ->   10m
 *      4    ->   30m
 *      5    ->    2h
 *      6    ->    6h
 *      7    ->   24h
 *      8    -> (dead — no further retry)
 *
 * After 20 consecutive failures an endpoint flips to `paused_failing`
 * and dispatch() skips it; admin clears by setting status back to
 * `active`.
 */

import { and, asc, desc, eq, ilike, inArray, lte, sql, type SQL } from "drizzle-orm";

import type { AppDeps } from "../../deps";
import {
  buildPage,
  clampLimit,
  cursorWhere,
  type Page,
  type PageParams,
} from "../../lib/pagination";
import { decrypt, encrypt } from "../../lib/crypto";
import { webhooksDeliveries, webhooksEndpoints } from "../../schema/webhooks";
import {
  generateSigningSecret,
  redactSecret,
  signDelivery,
} from "./crypto";
import {
  WebhookDeliveryNotFound,
  WebhookEndpointNotFound,
  WebhookInvalidInput,
  WebhookLimitExceeded,
} from "./errors";
import type {
  DispatchInput,
  WebhooksDelivery,
  WebhooksEndpoint,
  WebhooksEndpointView,
} from "./types";
import type {
  CreateEndpointInput,
  UpdateEndpointInput,
} from "./validators";

type WebhooksDeps = Pick<AppDeps, "db"> & { appSecret: string };

export type WebhooksServiceOptions = {
  /** Max endpoints per organization. Defaults to 5. */
  maxEndpointsPerOrg?: number;
  /** Skip signing_secret `paused_failing` after N consecutive fails. Default 20. */
  autoPauseThreshold?: number;
  /** Max attempts before status='dead'. Default 8. */
  maxAttempts?: number;
  /** HTTP timeout per attempt in ms. Default 10_000. */
  deliveryTimeoutMs?: number;
  /** Override clock for tests. */
  now?: () => Date;
  /** Override `fetch` for tests. */
  fetchImpl?: typeof fetch;
};

const DEFAULT_BACKOFF_MS: readonly number[] = [
  30_000, // after attempt 1
  2 * 60_000, // 2
  10 * 60_000, // 3
  30 * 60_000, // 4
  2 * 60 * 60_000, // 5
  6 * 60 * 60_000, // 6
  24 * 60 * 60_000, // 7
];

const SUCCEEDED_RETENTION_MS = 30 * 24 * 60 * 60_000;
const DEAD_RETENTION_MS = 90 * 24 * 60 * 60_000;

export function createWebhooksService(
  deps: WebhooksDeps,
  opts: WebhooksServiceOptions = {},
) {
  const { db, appSecret } = deps;
  const maxEndpointsPerOrg = opts.maxEndpointsPerOrg ?? 5;
  const autoPauseThreshold = opts.autoPauseThreshold ?? 20;
  const maxAttempts = opts.maxAttempts ?? 8;
  const deliveryTimeoutMs = opts.deliveryTimeoutMs ?? 10_000;
  const now = opts.now ?? (() => new Date());
  const fetchImpl = opts.fetchImpl ?? fetch;

  function toView(row: WebhooksEndpoint): WebhooksEndpointView {
    const {
      // strip the ciphertext — callers never need it raw
      secretCiphertext: _secret,
      ...rest
    } = row;
    return rest;
  }

  async function loadEndpoint(
    organizationId: string,
    id: string,
  ): Promise<WebhooksEndpoint> {
    let rows: WebhooksEndpoint[];
    try {
      rows = await db
        .select()
        .from(webhooksEndpoints)
        .where(
          and(
            eq(webhooksEndpoints.id, id),
            eq(webhooksEndpoints.organizationId, organizationId),
          ),
        )
        .limit(1);
    } catch (err) {
      if (isInvalidUuid(err)) throw new WebhookEndpointNotFound(id);
      throw err;
    }
    const row = rows[0];
    if (!row) throw new WebhookEndpointNotFound(id);
    return row;
  }

  return {
    async createEndpoint(
      organizationId: string,
      input: CreateEndpointInput,
    ): Promise<{ endpoint: WebhooksEndpointView; secret: string }> {
      const [countRow] = await db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(webhooksEndpoints)
        .where(eq(webhooksEndpoints.organizationId, organizationId));
      const current = countRow?.count ?? 0;
      if (current >= maxEndpointsPerOrg) {
        throw new WebhookLimitExceeded(maxEndpointsPerOrg);
      }

      const secret = generateSigningSecret();
      const ciphertext = await encrypt(secret, appSecret);

      const [row] = await db
        .insert(webhooksEndpoints)
        .values({
          organizationId,
          name: input.name,
          url: input.url,
          description: input.description ?? null,
          eventTypes: input.eventTypes ?? [],
          secretCiphertext: ciphertext,
          secretHint: redactSecret(secret),
        })
        .returning();
      if (!row) throw new Error("webhooks: insert returned no row");
      return { endpoint: toView(row), secret };
    },

    async listEndpoints(
      organizationId: string,
      params: PageParams = {},
    ): Promise<Page<WebhooksEndpointView>> {
      const limit = clampLimit(params.limit);
      const conds: SQL[] = [eq(webhooksEndpoints.organizationId, organizationId)];
      const seek = cursorWhere(params.cursor, webhooksEndpoints.createdAt, webhooksEndpoints.id);
      if (seek) conds.push(seek);
      if (params.q) {
        conds.push(ilike(webhooksEndpoints.name, `%${params.q}%`));
      }
      const rows = await db
        .select()
        .from(webhooksEndpoints)
        .where(and(...conds))
        .orderBy(desc(webhooksEndpoints.createdAt), desc(webhooksEndpoints.id))
        .limit(limit + 1);
      const page = buildPage(rows, limit);
      return { items: page.items.map(toView), nextCursor: page.nextCursor };
    },

    async getEndpoint(
      organizationId: string,
      id: string,
    ): Promise<WebhooksEndpointView> {
      const row = await loadEndpoint(organizationId, id);
      return toView(row);
    },

    async updateEndpoint(
      organizationId: string,
      id: string,
      patch: UpdateEndpointInput,
    ): Promise<WebhooksEndpointView> {
      // Load first so we error cleanly on unknown id before the UPDATE.
      await loadEndpoint(organizationId, id);

      const update: Partial<typeof webhooksEndpoints.$inferInsert> = {};
      if (patch.name !== undefined) update.name = patch.name;
      if (patch.url !== undefined) update.url = patch.url;
      if (patch.description !== undefined) update.description = patch.description;
      if (patch.eventTypes !== undefined) update.eventTypes = patch.eventTypes;
      if (patch.status !== undefined) {
        update.status = patch.status;
        // Going back to `active` clears the auto-pause counter so a
        // fresh streak can accumulate again. `disabled` leaves the
        // counter alone — admin may re-enable and expect context.
        if (patch.status === "active") {
          update.consecutiveFailures = 0;
          update.disabledAt = null;
        } else if (patch.status === "disabled") {
          update.disabledAt = now();
        }
      }

      if (Object.keys(update).length === 0) {
        return this.getEndpoint(organizationId, id);
      }

      const [row] = await db
        .update(webhooksEndpoints)
        .set(update)
        .where(
          and(
            eq(webhooksEndpoints.id, id),
            eq(webhooksEndpoints.organizationId, organizationId),
          ),
        )
        .returning();
      if (!row) throw new WebhookEndpointNotFound(id);
      return toView(row);
    },

    async rotateSecret(
      organizationId: string,
      id: string,
    ): Promise<{ endpoint: WebhooksEndpointView; secret: string }> {
      await loadEndpoint(organizationId, id);
      const secret = generateSigningSecret();
      const ciphertext = await encrypt(secret, appSecret);
      const [row] = await db
        .update(webhooksEndpoints)
        .set({
          secretCiphertext: ciphertext,
          secretHint: redactSecret(secret),
        })
        .where(
          and(
            eq(webhooksEndpoints.id, id),
            eq(webhooksEndpoints.organizationId, organizationId),
          ),
        )
        .returning();
      if (!row) throw new WebhookEndpointNotFound(id);
      return { endpoint: toView(row), secret };
    },

    async deleteEndpoint(organizationId: string, id: string): Promise<void> {
      try {
        const deleted = await db
          .delete(webhooksEndpoints)
          .where(
            and(
              eq(webhooksEndpoints.id, id),
              eq(webhooksEndpoints.organizationId, organizationId),
            ),
          )
          .returning({ id: webhooksEndpoints.id });
        if (deleted.length === 0) throw new WebhookEndpointNotFound(id);
      } catch (err) {
        if (isInvalidUuid(err)) throw new WebhookEndpointNotFound(id);
        throw err;
      }
    },

    /**
     * Fan out an internal event into one pending delivery per matching
     * active endpoint. Does NOT perform the HTTP call — the cron tick
     * (or a `ctx.waitUntil(deliverPending())` at the call site) drives
     * actual delivery.
     *
     * Silent no-op when there are no matching endpoints: the caller
     * doesn't need to check this upfront.
     */
    async dispatch(input: DispatchInput): Promise<{ queued: number }> {
      if (!input.eventType) {
        throw new WebhookInvalidInput("eventType is required");
      }
      const endpoints = await db
        .select()
        .from(webhooksEndpoints)
        .where(
          and(
            eq(webhooksEndpoints.organizationId, input.organizationId),
            eq(webhooksEndpoints.status, "active"),
          ),
        );
      const matched = endpoints.filter((e) =>
        matchesEventType(e.eventTypes, input.eventType),
      );
      if (matched.length === 0) return { queued: 0 };

      const eventId = input.eventId ?? crypto.randomUUID();
      const nowDate = now();
      const values = matched.map((e) => ({
        organizationId: input.organizationId,
        endpointId: e.id,
        eventId,
        eventType: input.eventType,
        payload: input.payload,
        status: "pending",
        attemptCount: 0,
        nextAttemptAt: nowDate,
      }));
      const inserted = await db
        .insert(webhooksDeliveries)
        .values(values)
        .returning({ id: webhooksDeliveries.id });
      return { queued: inserted.length };
    },

    /**
     * Pick up due deliveries and deliver them. Called from cron and
     * (best-effort) from `ctx.waitUntil(...)` after `dispatch()`.
     */
    async deliverPending(
      batchSize = 50,
    ): Promise<{ attempted: number; succeeded: number; failed: number }> {
      const nowDate = now();
      const candidates = await db
        .select({ id: webhooksDeliveries.id })
        .from(webhooksDeliveries)
        .where(
          and(
            inArray(webhooksDeliveries.status, ["pending", "failed"]),
            lte(webhooksDeliveries.nextAttemptAt, nowDate),
          ),
        )
        .orderBy(asc(webhooksDeliveries.nextAttemptAt))
        .limit(batchSize);

      let attempted = 0;
      let succeeded = 0;
      let failed = 0;

      for (const { id } of candidates) {
        const claimed = await claimDelivery(db, id, now());
        if (!claimed) continue; // lost the race — some other worker has it
        attempted++;
        const ok = await attemptDelivery({
          db,
          appSecret,
          fetchImpl,
          deliveryTimeoutMs,
          delivery: claimed,
          now,
          maxAttempts,
          autoPauseThreshold,
        });
        if (ok) succeeded++;
        else failed++;
      }

      return { attempted, succeeded, failed };
    },

    async listDeliveries(
      organizationId: string,
      endpointId: string,
      filter: PageParams & { status?: WebhooksDelivery["status"] } = {},
    ): Promise<Page<WebhooksDelivery>> {
      await loadEndpoint(organizationId, endpointId);
      const limit = clampLimit(filter.limit);
      const conds: SQL[] = [
        eq(webhooksDeliveries.organizationId, organizationId),
        eq(webhooksDeliveries.endpointId, endpointId),
      ];
      if (filter.status) {
        conds.push(eq(webhooksDeliveries.status, filter.status));
      }
      const seek = cursorWhere(
        filter.cursor,
        webhooksDeliveries.createdAt,
        webhooksDeliveries.id,
      );
      if (seek) conds.push(seek);
      const rows = await db
        .select()
        .from(webhooksDeliveries)
        .where(and(...conds))
        .orderBy(desc(webhooksDeliveries.createdAt), desc(webhooksDeliveries.id))
        .limit(limit + 1);
      return buildPage(rows, limit);
    },

    async getDelivery(
      organizationId: string,
      id: string,
    ): Promise<WebhooksDelivery> {
      let rows: WebhooksDelivery[];
      try {
        rows = await db
          .select()
          .from(webhooksDeliveries)
          .where(
            and(
              eq(webhooksDeliveries.id, id),
              eq(webhooksDeliveries.organizationId, organizationId),
            ),
          )
          .limit(1);
      } catch (err) {
        if (isInvalidUuid(err)) throw new WebhookDeliveryNotFound(id);
        throw err;
      }
      const row = rows[0];
      if (!row) throw new WebhookDeliveryNotFound(id);
      return row;
    },

    /**
     * Clone a delivery as a fresh pending row — preserves event id so
     * receivers treat it as the same event on retry. Used by admin
     * "replay" button.
     */
    async replayDelivery(
      organizationId: string,
      id: string,
    ): Promise<WebhooksDelivery> {
      const original = await this.getDelivery(organizationId, id);
      const [row] = await db
        .insert(webhooksDeliveries)
        .values({
          organizationId,
          endpointId: original.endpointId,
          eventId: original.eventId,
          eventType: original.eventType,
          payload: original.payload,
          status: "pending",
          attemptCount: 0,
          nextAttemptAt: now(),
        })
        .returning();
      if (!row) throw new Error("webhooks: replay insert returned no row");
      return row;
    },

    /**
     * Sweep old deliveries. Safe to call every minute from cron.
     */
    async cleanupOldDeliveries(): Promise<{ removed: number }> {
      const nowMs = now().getTime();
      const succeededCutoff = new Date(nowMs - SUCCEEDED_RETENTION_MS);
      const deadCutoff = new Date(nowMs - DEAD_RETENTION_MS);

      const succeededDel = await db
        .delete(webhooksDeliveries)
        .where(
          and(
            eq(webhooksDeliveries.status, "success"),
            lte(webhooksDeliveries.createdAt, succeededCutoff),
          ),
        )
        .returning({ id: webhooksDeliveries.id });

      const deadDel = await db
        .delete(webhooksDeliveries)
        .where(
          and(
            eq(webhooksDeliveries.status, "dead"),
            lte(webhooksDeliveries.createdAt, deadCutoff),
          ),
        )
        .returning({ id: webhooksDeliveries.id });

      return { removed: succeededDel.length + deadDel.length };
    },
  };
}

export type WebhooksService = ReturnType<typeof createWebhooksService>;

// ─── Internals ────────────────────────────────────────────────────

/**
 * Match an event type against a subscription filter array.
 * Empty array = match everything. Otherwise: entry matches if equal,
 * or if entry ends with `.*` and the type starts with the namespace.
 */
export function matchesEventType(
  subscriptions: unknown,
  eventType: string,
): boolean {
  if (!Array.isArray(subscriptions)) return true;
  if (subscriptions.length === 0) return true;
  for (const raw of subscriptions) {
    if (typeof raw !== "string") continue;
    if (raw === eventType) return true;
    if (raw.endsWith(".*")) {
      const prefix = raw.slice(0, -1); // keeps trailing dot
      if (eventType.startsWith(prefix)) return true;
    }
    if (raw === "*") return true;
  }
  return false;
}

/**
 * Atomic "still claimable?" UPDATE. Returns the locked row or null.
 */
async function claimDelivery(
  db: AppDeps["db"],
  id: string,
  nowDate: Date,
): Promise<WebhooksDelivery | null> {
  const [row] = await db
    .update(webhooksDeliveries)
    .set({
      status: "in_flight",
      attemptCount: sql`${webhooksDeliveries.attemptCount} + 1`,
      lastAttemptedAt: nowDate,
    })
    .where(
      and(
        eq(webhooksDeliveries.id, id),
        inArray(webhooksDeliveries.status, ["pending", "failed"]),
        lte(webhooksDeliveries.nextAttemptAt, nowDate),
      ),
    )
    .returning();
  return row ?? null;
}

type AttemptArgs = {
  db: AppDeps["db"];
  appSecret: string;
  fetchImpl: typeof fetch;
  deliveryTimeoutMs: number;
  delivery: WebhooksDelivery;
  now: () => Date;
  maxAttempts: number;
  autoPauseThreshold: number;
};

async function attemptDelivery(args: AttemptArgs): Promise<boolean> {
  const { db, appSecret, fetchImpl, deliveryTimeoutMs, delivery } = args;

  // Re-read endpoint to get the current ciphertext + status. If the
  // endpoint was deleted (ON DELETE CASCADE already dropped our
  // delivery in that case, so this is only hit on disable/pause)
  // we mark the delivery dead.
  const endpointRows = await db
    .select()
    .from(webhooksEndpoints)
    .where(eq(webhooksEndpoints.id, delivery.endpointId))
    .limit(1);
  const endpoint = endpointRows[0];
  if (!endpoint) {
    await markDead(db, delivery.id, args.now(), "endpoint not found");
    return false;
  }
  if (endpoint.status !== "active") {
    // Paused / disabled endpoints park deliveries as `failed` (not dead)
    // so admin re-enabling revives pending work.
    await db
      .update(webhooksDeliveries)
      .set({
        status: "failed",
        lastError: `endpoint status=${endpoint.status}`,
        nextAttemptAt: new Date(args.now().getTime() + 5 * 60_000),
      })
      .where(eq(webhooksDeliveries.id, delivery.id));
    return false;
  }

  const secret = await decrypt(endpoint.secretCiphertext, appSecret);
  const timestampSec = Math.floor(args.now().getTime() / 1000);
  const body = JSON.stringify({
    id: delivery.eventId,
    type: delivery.eventType,
    created_at: delivery.createdAt.toISOString(),
    organization_id: delivery.organizationId,
    data: delivery.payload,
  });
  const signature = await signDelivery({
    secret,
    timestamp: timestampSec,
    rawBody: body,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deliveryTimeoutMs);
  let status: number | null = null;
  let error: string | null = null;
  try {
    const res = await fetchImpl(endpoint.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "apollokit-webhooks/1",
        "x-apollokit-event-id": delivery.eventId,
        "x-apollokit-event-type": delivery.eventType,
        "x-apollokit-timestamp": String(timestampSec),
        "x-apollokit-signature": signature,
        "x-apollokit-delivery-id": delivery.id,
        "x-apollokit-attempt": String(delivery.attemptCount),
      },
      body,
      signal: controller.signal,
      redirect: "manual",
    });
    status = res.status;
    if (res.status < 200 || res.status >= 300) {
      error = `non-2xx status ${res.status}`;
    }
  } catch (err) {
    error = truncate((err as Error).message ?? String(err), 2048);
  } finally {
    clearTimeout(timer);
  }

  if (error === null && status !== null && status >= 200 && status < 300) {
    // Success path — clear consecutive_failures on the endpoint.
    const nowDate = args.now();
    await db
      .update(webhooksDeliveries)
      .set({
        status: "success",
        lastStatusCode: status,
        lastError: null,
        succeededAt: nowDate,
      })
      .where(eq(webhooksDeliveries.id, delivery.id));
    await db
      .update(webhooksEndpoints)
      .set({ consecutiveFailures: 0, lastSuccessAt: nowDate })
      .where(eq(webhooksEndpoints.id, endpoint.id));
    return true;
  }

  // Failure path — pick next backoff slot or kill.
  const nextAttempt = delivery.attemptCount; // already incremented by claimDelivery
  const nowDate = args.now();
  if (nextAttempt >= args.maxAttempts) {
    await db
      .update(webhooksDeliveries)
      .set({
        status: "dead",
        lastStatusCode: status,
        lastError: truncate(error ?? "unknown error", 2048),
        failedAt: nowDate,
      })
      .where(eq(webhooksDeliveries.id, delivery.id));
  } else {
    const backoffIdx = Math.min(nextAttempt - 1, DEFAULT_BACKOFF_MS.length - 1);
    const waitMs = DEFAULT_BACKOFF_MS[backoffIdx]!;
    await db
      .update(webhooksDeliveries)
      .set({
        status: "failed",
        lastStatusCode: status,
        lastError: truncate(error ?? "unknown error", 2048),
        nextAttemptAt: new Date(nowDate.getTime() + waitMs),
      })
      .where(eq(webhooksDeliveries.id, delivery.id));
  }

  // Increment endpoint failure counter; auto-pause if we crossed threshold.
  const [updated] = await db
    .update(webhooksEndpoints)
    .set({
      consecutiveFailures: sql`${webhooksEndpoints.consecutiveFailures} + 1`,
      lastFailureAt: nowDate,
    })
    .where(eq(webhooksEndpoints.id, endpoint.id))
    .returning({ consecutive: webhooksEndpoints.consecutiveFailures });
  if (
    updated &&
    updated.consecutive >= args.autoPauseThreshold &&
    endpoint.status === "active"
  ) {
    await db
      .update(webhooksEndpoints)
      .set({ status: "paused_failing", disabledAt: nowDate })
      .where(eq(webhooksEndpoints.id, endpoint.id));
  }
  return false;
}

async function markDead(
  db: AppDeps["db"],
  id: string,
  nowDate: Date,
  reason: string,
): Promise<void> {
  await db
    .update(webhooksDeliveries)
    .set({
      status: "dead",
      lastError: reason,
      failedAt: nowDate,
    })
    .where(eq(webhooksDeliveries.id, id));
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

function isInvalidUuid(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { cause?: { code?: unknown }; code?: unknown };
  if (e.code === "22P02") return true;
  if (e.cause && typeof e.cause === "object" && e.cause.code === "22P02")
    return true;
  const msg = (err as { message?: unknown }).message;
  return typeof msg === "string" && msg.includes("22P02");
}
