/**
 * C-end client routes for the dialogue module.
 *
 * Mounted at /api/client/dialogue. Auth pattern:
 *
 *   requireClientCredential — validates x-api-key (cpk_...), populates c.var.clientCredential
 *   requireClientUser       — reads x-end-user-id + x-user-hash headers, verifies HMAC,
 *                             populates c.var.endUserId
 *
 *   GET  /scripts/{alias}/start        — begin or resume
 *   POST /scripts/{alias}/advance      — pick an option / step forward
 *   POST /scripts/{alias}/reset        — restart (repeatable scripts only)
 *
 * Scripts without an alias are unreachable here — the publish-gate pattern
 * documented on the module's service.
 */

import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { ModuleError } from "../../lib/errors";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { requireClientUser } from "../../middleware/require-client-user";
import { dialogueService } from "./index";
import type { DialogueSessionView } from "./types";
import {
  AdvanceDialogueSchema,
  AliasParamSchema,
  DialogueSessionResponseSchema,
  ErrorResponseSchema,
} from "./validators";

const TAG = "Dialogue (Client)";

function serializeSession(view: DialogueSessionView) {
  return {
    scriptId: view.scriptId,
    scriptAlias: view.scriptAlias,
    currentNode: view.currentNode,
    historyPath: view.historyPath,
    completedAt: view.completedAt,
    grantedRewards: view.grantedRewards,
  };
}

const errorResponses = {
  400: {
    description: "Bad request",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
  401: {
    description: "Unauthorized",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
  404: {
    description: "Not found",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
  409: {
    description: "Conflict",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
};

export const dialogueClientRouter = new OpenAPIHono<HonoEnv>();

dialogueClientRouter.use("*", requireClientCredential);
dialogueClientRouter.use("*", requireClientUser);

dialogueClientRouter.onError((err, c) => {
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

dialogueClientRouter.openapi(
  createRoute({
    method: "get",
    path: "/scripts/{alias}/start",
    tags: [TAG],
    summary: "Begin or resume a dialogue script",
    request: {
      params: AliasParamSchema,
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: DialogueSessionResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const { alias } = c.req.valid("param");
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const view = await dialogueService.start(orgId, endUserId, alias);
    return c.json(serializeSession(view), 200);
  },
);

dialogueClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/scripts/{alias}/advance",
    tags: [TAG],
    summary: "Advance the dialogue session by one step",
    request: {
      params: AliasParamSchema,
      body: {
        content: { "application/json": { schema: AdvanceDialogueSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: DialogueSessionResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const { alias } = c.req.valid("param");
    const { optionId } = c.req.valid("json");
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const view = await dialogueService.advance(
      orgId,
      endUserId,
      alias,
      optionId,
    );
    return c.json(serializeSession(view), 200);
  },
);

dialogueClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/scripts/{alias}/reset",
    tags: [TAG],
    summary: "Reset a repeatable dialogue script",
    request: {
      params: AliasParamSchema,
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: DialogueSessionResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const { alias } = c.req.valid("param");
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const view = await dialogueService.reset(orgId, endUserId, alias);
    return c.json(serializeSession(view), 200);
  },
);
