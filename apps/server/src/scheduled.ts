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

import { requestContext } from "./lib/request-context";
import { activityService } from "./modules/activity";
import { assistPoolService } from "./modules/assist-pool";
import { leaderboardService } from "./modules/leaderboard";
import { webhooksService } from "./modules/webhooks";

export type ScheduledEvent = {
  cron: string;
  scheduledTime: number;
};

export async function scheduled(
  event: ScheduledEvent,
  _env: unknown,
  ctx: { waitUntil: (p: Promise<unknown>) => void },
): Promise<void> {
  const now = new Date(event.scheduledTime);
  // One synthetic trace id per tick — every domain event fired inside this
  // tick tags Tinybird rows with the same id, so the cron run shows up as
  // a single `tenant_trace` waterfall just like a fetch request does.
  const traceId = `cron-${crypto.randomUUID()}`;
  console.log(
    `[scheduled] tick cron=${event.cron} at=${now.toISOString()} trace=${traceId}`,
  );

  await requestContext.run({ traceId }, async () => {
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
  });
}

async function runTask(
  name: string,
  fn: () => Promise<unknown>,
): Promise<void> {
  const started = Date.now();
  try {
    await fn();
    console.log(`[scheduled] ${name} ok (${Date.now() - started}ms)`);
  } catch (err) {
    console.error(`[scheduled] ${name} failed:`, err);
  }
}
