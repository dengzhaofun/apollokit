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
 *   (Future phases will add: activity state advancement, activity
 *    schedule firing, webhook delivery retry, etc.)
 *
 * Failure isolation: each top-level task is wrapped in try/catch so a
 * single failing task does not abort the tick. Errors are logged and
 * will surface via Cloudflare Workers observability.
 */

import { requestContext } from "./lib/request-context";
import { activityService } from "./modules/activity";
import { assistPoolService } from "./modules/assist-pool";
import { leaderboardService } from "./modules/leaderboard";

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
