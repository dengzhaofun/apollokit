/**
 * Client-facing HTTP routes for the entity module.
 *
 * Guarded by client credential + HMAC middleware (same as other
 * client routers). Phase 1 is a stub — actual endpoints arrive in
 * Phase 2 (instance management) and beyond.
 */

import { OpenAPIHono } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { ModuleError } from "../../lib/errors";
import { ErrorResponseSchema } from "./validators";

export const entityClientRouter = new OpenAPIHono<HonoEnv>();

entityClientRouter.onError((err, c) => {
  if (err instanceof ModuleError) {
    return c.json(
      {
        error: err.message,
        code: err.code,
        requestId: c.get("requestId"),
      },
      err.httpStatus as ContentfulStatusCode,
    );
  }
  throw err;
});

// Phase 2+: instance acquire, list, get, discard
// Phase 3+: level-up, rank-up, synthesize, add-exp
// Phase 4+: equip, unequip, change-skin, lock
// Phase 5+: formations CRUD
