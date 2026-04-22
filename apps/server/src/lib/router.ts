/**
 * Factory for every business-module `OpenAPIHono` router.
 *
 * Bundles two cross-cutting concerns so no module has to repeat them:
 *
 *  1. `defaultHook` — `@hono/zod-openapi` validation failures (query /
 *     body / param) are translated into the standard envelope with
 *     `code: "validation_error"` instead of the library's default
 *     `{ success: false, error }` shape. This keeps the frontend /
 *     SDK unwrap logic uniform with business errors.
 *
 *  2. `onError` — instances of `ModuleError` are translated into the
 *     standard envelope with the subclass's `code` and `httpStatus`.
 *     Unknown errors are rethrown so the global `app.onError` in
 *     `src/index.ts` produces a 500 envelope.
 *
 * Every module's router MUST be created with this factory — the
 * previous pattern of `new OpenAPIHono<HonoEnv>()` plus a handwritten
 * `router.onError(...)` block per module is retired.
 */

import { OpenAPIHono } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../env";
import { ModuleError } from "./errors";
import { VALIDATION_ERROR_CODE, fail } from "./response";

export function makeApiRouter() {
  const router = new OpenAPIHono<HonoEnv>({
    defaultHook: (result, c) => {
      if (!result.success) {
        const issues = result.error.issues;
        const message =
          issues
            .map(
              (i) => `${i.path.length === 0 ? "(root)" : i.path.join(".")}: ${i.message}`,
            )
            .join("; ") || result.error.message;
        return c.json(fail(VALIDATION_ERROR_CODE, message), 400);
      }
    },
  });

  router.onError((err, c) => {
    if (err instanceof ModuleError) {
      return c.json(
        fail(err.code, err.message),
        err.httpStatus as ContentfulStatusCode,
      );
    }
    throw err; // → global app.onError → 500 envelope
  });

  return router;
}
