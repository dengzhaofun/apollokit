/**
 * Per-request AsyncLocalStorage (ALS) store.
 *
 * Why this exists: services are protocol-agnostic (see apps/server/CLAUDE.md
 * — service.ts must not import Hono or Context). But downstream subscribers
 * like `modules/analytics/subscribers/*` need the per-request `traceId` to
 * tag every business event in Tinybird so they join with the `http_requests`
 * row recorded by `middleware/request-log.ts`. Threading `traceId` through
 * every service signature and every `emit()` payload would bloat 26 existing
 * domain events for a single cross-cutting concern — ALS keeps that concern
 * invisible to the business layer.
 *
 * Workers runtime supports `node:async_hooks` under `nodejs_compat`
 * (enabled in `wrangler.jsonc`). The store is populated by a middleware
 * in `src/index.ts` after `requestId()` has assigned `c.get("requestId")`,
 * and by `src/scheduled.ts` on each cron tick.
 *
 * Read with `getTraceId()` — returns `""` when outside a store (e.g. under
 * vitest where nothing populated it). This matches the wire-format default
 * the Tinybird writer uses for empty trace ids.
 */

import { AsyncLocalStorage } from "node:async_hooks";

export type RequestContext = {
  traceId: string;
};

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function getTraceId(): string {
  return requestContext.getStore()?.traceId ?? "";
}
