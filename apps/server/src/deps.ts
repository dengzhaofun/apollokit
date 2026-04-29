import { env } from "cloudflare:workers";

import { db } from "./db";
import { createAIProvider, type AIProvider } from "./lib/ai";
import {
  createAnalyticsService,
  type AnalyticsService,
} from "./lib/analytics";
import { createEventBus, type EventBus } from "./lib/event-bus";
import type {
  EventEnvelope,
  EventQueueProducer,
} from "./lib/event-queue";
import { logger } from "./lib/logger";
import { createObjectStorage, type ObjectStorage } from "./lib/storage";
import {
  createEventCatalogService,
  type EventCatalogService,
} from "./modules/event-catalog/service";
import { redis } from "./redis";

/**
 * Single source of truth for all shared application dependencies.
 *
 * When a new dependency arrives (logger, unified behavior log, etc.)
 * add it to this type and to the `deps` singleton below. Services declare
 * what they need via `Pick<AppDeps, ...>` — only services that actually
 * use the new dependency have to change.
 *
 * See apps/server/CLAUDE.md for the full rule.
 */
export type AppDeps = {
  db: typeof db;
  redis: typeof redis;
  events: EventBus;
  appSecret: string;
  storage: ObjectStorage;
  analytics: AnalyticsService;
  eventCatalog: EventCatalogService;
  ai: AIProvider;
  /**
   * Cloudflare Queues producer for the events fan-out path. webhook
   * bridge / trigger bridge enqueue here; consumer in `src/queue.ts`
   * drains. Lazy-resolved over `env.EVENTS_QUEUE` so vitest (no real
   * binding) can swap in `createEventQueueStub()` via factory tests.
   *
   * 在 `cloudflare:workers` shim 下（vitest）`send` 是 best-effort no-op
   * + warn —— 单测如要断言 enqueue，应直接传 stub 给 bridge factory，
   * 不要依赖 deps 单例。
   */
  eventsQueue: EventQueueProducer;
  // logger: typeof logger;
  // behaviorLog: typeof behaviorLog;
};

/**
 * The per-isolate singleton. Cloudflare Workers reuse module scope across
 * requests within the same isolate, so this is effectively constructed once
 * and reused for the lifetime of the isolate (same pattern as ./db).
 */
export const deps: AppDeps = {
  db,
  redis,
  events: createEventBus(),
  appSecret: env.BETTER_AUTH_SECRET,
  // Storage driver is resolved lazily via a Proxy so the binding
  // lookup doesn't happen at module load (for imports that never use
  // storage, e.g. drizzle-kit generate running this file under Node).
  storage: createLazyStorage(),
  // Same lazy pattern for Tinybird — avoids touching env vars during
  // drizzle-kit generate under Node, where those bindings don't exist.
  analytics: createLazyAnalytics(),
  // Event catalog only depends on `db` — safe to construct eagerly.
  eventCatalog: createEventCatalogService({ db }),
  // AI provider lazily constructs the OpenRouter client on first call,
  // so importing this module under Node (e.g. drizzle-kit) doesn't need
  // OPENROUTER_API_KEY to be present.
  ai: createAIProvider(),
  // Lazy queue producer — see `createLazyEventsQueue` below for why.
  eventsQueue: createLazyEventsQueue(),
};

/**
 * Delay the actual `createObjectStorage(env)` call until the first
 * method call. This keeps env-var-driven validation out of the hot
 * import path — if a deploy forgets to set STORAGE_DRIVER but never
 * uses the media-library module, nothing breaks.
 */
function createLazyStorage(): ObjectStorage {
  let instance: ObjectStorage | null = null;
  function resolve(): ObjectStorage {
    if (!instance) {
      instance = createObjectStorage(
        env as unknown as Parameters<typeof createObjectStorage>[0],
      );
    }
    return instance;
  }
  return new Proxy({} as ObjectStorage, {
    get(_t, prop) {
      const target = resolve() as unknown as Record<string | symbol, unknown>;
      const value = target[prop];
      if (typeof value === "function") {
        return (value as (...args: unknown[]) => unknown).bind(target);
      }
      return value;
    },
  });
}

function createLazyAnalytics(): AnalyticsService {
  let instance: AnalyticsService | null = null;
  function resolve(): AnalyticsService {
    if (!instance) {
      instance = createAnalyticsService();
    }
    return instance;
  }
  return new Proxy({} as AnalyticsService, {
    get(_t, prop) {
      const target = resolve() as unknown as Record<string | symbol, unknown>;
      const value = target[prop];
      if (typeof value === "function") {
        return (value as (...args: unknown[]) => unknown).bind(target);
      }
      return value;
    },
  });
}

/**
 * Resolve EVENTS_QUEUE binding lazily — the binding is only present in
 * the workerd runtime; under vitest (`cloudflare:workers` shim) it's
 * undefined, and under `drizzle-kit` running in plain Node `env` itself
 * may not even be valid. Both paths must not crash on `import` —— we
 * fall back to a best-effort no-op + warn so any accidental enqueue at
 * test time is loud but doesn't fail the test.
 *
 * Production path: `env.EVENTS_QUEUE.send(envelope)` is the canonical
 * fan-out trigger. The consumer in `src/queue.ts` does the actual
 * webhooksService.dispatch + (M3) triggerEngine.evaluate.
 */
function createLazyEventsQueue(): EventQueueProducer {
  return {
    async send(msg: EventEnvelope): Promise<void> {
      const queue = (env as { EVENTS_QUEUE?: Queue<EventEnvelope> })
        .EVENTS_QUEUE;
      if (!queue) {
        logger.warn(
          `[event-queue] no EVENTS_QUEUE binding available; dropping ${msg.name}. ` +
            `Tests that need to assert enqueue should pass an EventQueueStub directly.`,
        );
        return;
      }
      await queue.send(msg);
    },
  };
}
