/**
 * Structured logger that auto-injects the per-request `traceId` from the
 * AsyncLocalStorage store in `request-context.ts`. Every business log
 * goes through this so it can be joined back to the `http_requests` row
 * recorded in Tinybird by `middleware/request-log.ts`.
 *
 * The output is a single `console.<level>(...)` call with a JSON-shaped
 * object as the first arg — Workers Logs captures `console.*` natively
 * and indexes the fields, so the same record is searchable in the
 * Workers dashboard and (via traceId) in Tinybird.
 *
 * API:
 *
 *   logger.error("task.filter_compile_failed", { defId, err });
 *   logger.warn("leaderboard.redis_update_failed", err);
 *   logger.info("activity.archived", { activityId });
 *
 * Convention: `event` is `<module>.<snake_case_action>` so events sort
 * by module in log views and stay grep-able.
 */

import { getTraceId } from "./request-context";

type Fields = Record<string, unknown>;

function normalize(fields: unknown): Fields {
  if (fields === undefined || fields === null) return {};
  if (fields instanceof Error) {
    return {
      error: fields.message,
      errorName: fields.name,
      stack: fields.stack,
    };
  }
  if (typeof fields === "object") return fields as Fields;
  return { value: fields };
}

function emit(
  level: "error" | "warn" | "info",
  event: string,
  fields: unknown,
): void {
  const payload = {
    level,
    event,
    traceId: getTraceId(),
    ...normalize(fields),
  };
  console[level](payload);
}

export const logger = {
  error(event: string, fields?: unknown): void {
    emit("error", event, fields);
  },
  warn(event: string, fields?: unknown): void {
    emit("warn", event, fields);
  },
  info(event: string, fields?: unknown): void {
    emit("info", event, fields);
  },
};
