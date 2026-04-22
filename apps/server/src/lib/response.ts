/**
 * Standard API response envelope.
 *
 * Every business endpoint (everything under `/api/*` EXCEPT Better Auth's
 * `/api/auth/*` and `/api/client/auth/*`, which are third-party-owned)
 * returns:
 *
 *     { code: string, data: T | null, message: string, requestId: string }
 *
 * Rules:
 *  - Successful responses use `code: "ok"` and the data payload.
 *  - Business errors use the module-specific `code` from `ModuleError`
 *    (e.g. `"check_in.config_not_found"`), HTTP status = err.httpStatus,
 *    `data: null`.
 *  - Validation errors use `code: "validation_error"`, HTTP 400.
 *  - Uncaught errors use `code: "internal_error"`, HTTP 500.
 *  - Delete / ack endpoints return HTTP 200 with `data: null` — we do
 *    NOT use 204 any more, so the SDK/frontend wrapper can unwrap
 *    uniformly without branching on status.
 *
 * `requestId` is read from AsyncLocalStorage (populated by the
 * `requestContext` middleware in `src/index.ts`). Outside a request
 * context `getTraceId()` returns "" — acceptable for tests and
 * scheduled jobs.
 */

import { z } from "@hono/zod-openapi";

import { getTraceId } from "./request-context";

export const OK_CODE = "ok";
export const VALIDATION_ERROR_CODE = "validation_error";
export const INTERNAL_ERROR_CODE = "internal_error";

export type OkEnvelope<T> = {
  code: typeof OK_CODE;
  data: T;
  message: string;
  requestId: string;
};

export type ErrorEnvelope = {
  code: string;
  data: null;
  message: string;
  requestId: string;
};

export type ApiEnvelope<T> = OkEnvelope<T> | ErrorEnvelope;

// `ok()` is typed as `OkEnvelope<T>` (not the general `ApiEnvelope<T>`)
// so the `code: "ok"` literal survives into the route handler's return
// type — `@hono/zod-openapi` declares the response body as
// `z.literal("ok")`, so a widened `string` would fail the Handler
// signature check.
export function ok<T>(data: T): OkEnvelope<T> {
  return {
    code: OK_CODE,
    data,
    message: "",
    requestId: getTraceId(),
  };
}

export function fail(code: string, message: string): ErrorEnvelope {
  return {
    code,
    data: null,
    message,
    requestId: getTraceId(),
  };
}

/**
 * Wrap an existing data schema in the envelope. Used at every
 * `responses.<status>.content.application/json.schema` site so the
 * emitted OpenAPI spec reflects the actual wire format — which keeps
 * the generated SDKs' types honest.
 */
export function envelopeOf<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    code: z.literal(OK_CODE),
    data: dataSchema,
    message: z.string(),
    requestId: z.string(),
  });
}

export const ErrorEnvelopeSchema = z
  .object({
    code: z.string(),
    data: z.null(),
    message: z.string(),
    requestId: z.string(),
  })
  .openapi("ApiErrorEnvelope");

/**
 * Success envelope with null data — for endpoints that previously
 * returned 204 No Content.
 */
export const NullDataEnvelopeSchema = z
  .object({
    code: z.literal(OK_CODE),
    data: z.null(),
    message: z.string(),
    requestId: z.string(),
  })
  .openapi("ApiNullEnvelope");

/**
 * Shared `errorResponses` block used at the bottom of every route's
 * `responses` object. Every 4xx/5xx points at `ErrorEnvelopeSchema` —
 * the HTTP status and the `description` text are the only things that
 * vary.
 */
export const commonErrorResponses = {
  400: {
    description: "Bad request",
    content: { "application/json": { schema: ErrorEnvelopeSchema } },
  },
  401: {
    description: "Unauthorized",
    content: { "application/json": { schema: ErrorEnvelopeSchema } },
  },
  403: {
    description: "Forbidden",
    content: { "application/json": { schema: ErrorEnvelopeSchema } },
  },
  404: {
    description: "Not found",
    content: { "application/json": { schema: ErrorEnvelopeSchema } },
  },
  409: {
    description: "Conflict",
    content: { "application/json": { schema: ErrorEnvelopeSchema } },
  },
  500: {
    description: "Internal server error",
    content: { "application/json": { schema: ErrorEnvelopeSchema } },
  },
} as const;
