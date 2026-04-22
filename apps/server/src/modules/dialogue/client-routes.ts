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

import type { HonoEnv } from "../../env";
import { commonErrorResponses, envelopeOf, ok } from "../../lib/response";
import { createClientRouter, createClientRoute } from "../../lib/openapi";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { requireClientUser } from "../../middleware/require-client-user";
import { dialogueService } from "./index";
import type { DialogueSessionView } from "./types";
import {
  AdvanceDialogueSchema,
  AliasParamSchema,
  DialogueSessionResponseSchema,
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

export const dialogueClientRouter = createClientRouter();

dialogueClientRouter.use("*", requireClientCredential);
dialogueClientRouter.use("*", requireClientUser);

dialogueClientRouter.openapi(
  createClientRoute({
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
          "application/json": { schema: envelopeOf(DialogueSessionResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const { alias } = c.req.valid("param");
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const view = await dialogueService.start(orgId, endUserId, alias);
    return c.json(ok(serializeSession(view)), 200);
  },
);

dialogueClientRouter.openapi(
  createClientRoute({
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
          "application/json": { schema: envelopeOf(DialogueSessionResponseSchema) },
        },
      },
      ...commonErrorResponses,
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
    return c.json(ok(serializeSession(view)), 200);
  },
);

dialogueClientRouter.openapi(
  createClientRoute({
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
          "application/json": { schema: envelopeOf(DialogueSessionResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const { alias } = c.req.valid("param");
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const view = await dialogueService.reset(orgId, endUserId, alias);
    return c.json(ok(serializeSession(view)), 200);
  },
);
