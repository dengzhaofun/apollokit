/**
 * Cloudflare Workers scheduled (cron) entry point.
 *
 * Wrangler invokes this handler on the schedule declared in
 * `wrangler.jsonc → triggers.crons`. It runs inside the same isolate
 * boundary as normal `fetch` requests, so all module singletons
 * (db, redis, services) are already constructed.
 *
 * Responsibilities per tick:
 *   1. Leaderboard settlement — close any cycleKey whose window has
 *      passed, write a snapshot row, and dispatch tier rewards.
 *   2. Activity lifecycle advancement + schedule firing.
 *   3. Assist-pool expiration.
 *   4. Webhook delivery — pick up pending/failed rows whose backoff
 *      has elapsed, POST to the subscriber, record outcome.
 *   5. Webhook cleanup — sweep old succeeded/dead delivery rows.
 *
 * Failure isolation: each top-level task is wrapped in try/catch so a
 * single failing task does not abort the tick. Errors are logged and
 * will surface via Cloudflare Workers observability.
 */

import { withDbContext } from "./db";
import { requestContext } from "./lib/request-context";
import { activityService } from "./modules/activity";
import { assistPoolService } from "./modules/assist-pool";
import { billingService } from "./modules/billing";
import { leaderboardService } from "./modules/leaderboard";
import { webhooksService } from "./modules/webhooks";
import { logger } from "./lib/logger";

export type ScheduledEvent = {
  cron: string;
  scheduledTime: number;
};

export async function scheduled(
  event: ScheduledEvent,
  env: CloudflareBindings,
  ctx: { waitUntil: (p: Promise<unknown>) => void },
): Promise<void> {
  const now = new Date(event.scheduledTime);
  // One synthetic trace id per tick — every domain event fired inside this
  // tick tags Tinybird rows with the same id, so the cron run shows up as
  // a single `tenant_trace` waterfall just like a fetch request does.
  const traceId = `cron-${crypto.randomUUID()}`;
  logger.info(
    `[scheduled] tick cron=${event.cron} at=${now.toISOString()} trace=${traceId}`,
  );

  // One Hyperdrive client per cron tick — all five tasks share it, which is
  // safe because none open a `db.transaction()` today. If a future task does,
  // give it its own `withDbContext` so a long transaction doesn't pin this
  // tick's pooled connection while the others run.
  await withDbContext(env, () =>
    requestContext.run({ traceId }, async () => {
      // Each task is independent — one failure shouldn't block the others.
      ctx.waitUntil(
        runTask("leaderboard.settleDue", () =>
          leaderboardService.settleDue({ now }),
        ),
      );
      ctx.waitUntil(
        runTask("activity.tickDue", () => activityService.tickDue({ now })),
      );
      ctx.waitUntil(
        runTask("assist_pool.expireOverdue", () =>
          assistPoolService.expireOverdue({ now }),
        ),
      );
      ctx.waitUntil(
        runTask("webhooks.deliverPending", () =>
          webhooksService.deliverPending(),
        ),
      );
      ctx.waitUntil(
        runTask("webhooks.cleanupOldDeliveries", () =>
          webhooksService.cleanupOldDeliveries(),
        ),
      );
      // Hourly: scan teams crossing 80/100/150% of plan quota and
      // fire one alert email per (team, year_month, threshold).
      // Idempotent — `mau_alert` unique key dedupes within a month.
      if (now.getUTCMinutes() === 0) {
        ctx.waitUntil(
          runTask("billing.runMauAlerts", () =>
            billingService.runMauAlerts({ now }),
          ),
        );
      }
      // First 5 minutes of UTC day-1: snapshot last month's MAU
      // for invoicing. The 5-minute window absorbs occasional
      // missed ticks; the unique key on `mau_snapshot` makes
      // re-runs no-ops.
      if (
        now.getUTCDate() === 1 &&
        now.getUTCHours() === 0 &&
        now.getUTCMinutes() < 5
      ) {
        ctx.waitUntil(
          runTask("billing.runMonthlyMauSnapshot", () =>
            billingService.runMonthlyMauSnapshot({ now }),
          ),
        );
      }
    }),
  );
}

async function runTask(
  name: string,
  fn: () => Promise<unknown>,
): Promise<void> {
  const started = Date.now();
  try {
    await fn();
    logger.info(`[scheduled] ${name} ok (${Date.now() - started}ms)`);
  } catch (err) {
    logger.error(`[scheduled] ${name} failed:`, err);
  }
}
