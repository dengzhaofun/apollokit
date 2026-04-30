/**
 * Cloudflare Queues consumer for the event fan-out queue.
 *
 * Wrangler invokes this on every batch of `apollokit-events` messages.
 * Producer side is the webhook event-bridge (and M3+ trigger bridge),
 * which serializes domain events into `EventEnvelope` and `send()` them
 * during normal request handling. The consumer routes each message by
 * `capabilities`:
 *
 *   - "webhook"      → webhooksService.dispatch + ctx.waitUntil(deliverPending)
 *                      (dispatch writes deliveries rows; deliverPending
 *                      pushes the actual HTTP POST so receivers see the
 *                      event in seconds, not minutes-via-cron.)
 *   - "trigger-rule" → triggerEngine.evaluate (M3, not wired yet — TODO)
 *
 * Failure semantics:
 *   - Per-message try/catch logs and calls `msg.retry()` so other messages
 *     in the batch are not poisoned by one bad payload.
 *   - The cron `webhooks.deliverPending` task in `scheduled.ts` remains
 *     the source-of-truth durability mechanism: even if a queue retry
 *     never lands, the deliveries row is still in Postgres pending and
 *     the next-minute cron will pick it up.
 *   - max_retries (5) + DLQ `apollokit-events-dlq` configured in
 *     wrangler.jsonc handle absolute give-up.
 */

import { withDbContext } from "./db";
import type { EventEnvelope } from "./lib/event-queue";
import { logger } from "./lib/logger";
import { requestContext } from "./lib/request-context";
import { triggerService } from "./modules/triggers";
import type { TriggerService } from "./modules/triggers/service";
import { webhooksService } from "./modules/webhooks";
import type { WebhooksService } from "./modules/webhooks/service";

/**
 * 路由依赖——routing layer 需要的 service 引用。
 * 单测注入 mock；prod 走 module barrel singleton。
 */
export type QueueHandlerDeps = {
  webhooks: Pick<WebhooksService, "dispatch" | "deliverPending">;
  triggers: Pick<TriggerService, "evaluate">;
};

/**
 * Factory 形态，便于单测注入 fake services（参考 service.ts 的 DI 风格）。
 * Default `queue` 导出绑死 module-singleton，wrangler / Sentry 用它。
 */
export function createQueueHandler(d: QueueHandlerDeps) {
  return async function queue(
    batch: MessageBatch<unknown>,
    env: CloudflareBindings,
    ctx: ExecutionContext,
  ): Promise<void> {
    logger.info(
      `[queue] batch size=${batch.messages.length} queue=${batch.queue}`,
    );
    for (const msg of batch.messages) {
      const envelope = msg.body as EventEnvelope;
      // Each message gets the original emit's traceId — ties consume-side
      // side effects back to the request that produced it (analytics rows,
      // audit logs all share the same trace correlation).
      const traceId = envelope.traceId || `queue-${crypto.randomUUID()}`;
      // Fresh Hyperdrive client per message: each envelope is a logical
      // "request" with its own ack/retry lifecycle, and a transient error
      // on one shouldn't poison the next one's connection state.
      await withDbContext(env, () =>
        requestContext.run({ traceId }, async () => {
          try {
            await handleEnvelope(envelope, d, ctx);
            msg.ack();
          } catch (err) {
            logger.error(
              `[queue] handler for ${envelope.name} failed (orgId=${envelope.orgId}, attempt=${msg.attempts})`,
              err,
            );
            // 退避：1m / 5m / 30m / 2h / 6h —— 与 webhook deliveries 8-step
            // 退避同形状但更短（queue 重试是触发器层的，不是终端投递层）。
            const delaySeconds = backoffSeconds(msg.attempts);
            msg.retry({ delaySeconds });
          }
        }),
      );
    }
  };
}

/**
 * Handle a single envelope — exported for direct unit testing.
 * Routes by `envelope.capabilities`, fans out to webhook dispatch (M2)
 * and (M3, TODO) trigger-rule evaluation.
 */
export async function handleEnvelope(
  envelope: EventEnvelope,
  d: QueueHandlerDeps,
  ctx: ExecutionContext,
): Promise<void> {
  if (envelope.capabilities.includes("webhook")) {
    const { queued } = await d.webhooks.dispatch({
      organizationId: envelope.orgId,
      eventType: envelope.name,
      payload: envelope.payload,
    });
    if (queued > 0) {
      // Real-time delivery —— 不等下一个 cron tick。失败仍由 deliveries
      // 表 + cron 兜底,这里 fire-and-forget 即可。
      ctx.waitUntil(d.webhooks.deliverPending());
    }
  }
  if (envelope.capabilities.includes("trigger-rule")) {
    await d.triggers.evaluate(
      envelope.orgId,
      envelope.name,
      envelope.payload,
      { traceId: envelope.traceId },
    );
  }
}

function backoffSeconds(attempt: number): number {
  // attempt: 1 (first retry) → 60s, 2 → 300s, 3 → 1800s, 4 → 7200s, 5 → 21600s.
  const ladder = [60, 300, 1800, 7200, 21600];
  return ladder[Math.min(attempt - 1, ladder.length - 1)] ?? 60;
}

/** Production handler bound to the module-singleton services. */
export const queue = createQueueHandler({
  webhooks: webhooksService,
  triggers: triggerService,
});
