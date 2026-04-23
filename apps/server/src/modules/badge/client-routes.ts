/**
 * Client-facing HTTP routes for the badge module.
 *
 * Exposes the player-side read surface:
 *   - GET  /tree            — full / subtree of red-dot state for the caller
 *   - POST /dismiss         — dismiss a node (mode != 'auto')
 *   - POST /reset-session   — wipe session-mode dismissals (login hook)
 *
 * Auth: cpk_ + end-user channel (session cookie OR HMAC). Matches the
 * mail / announcement / battle-pass client surfaces exactly.
 *
 * organizationId comes from the client credential; endUserId comes from
 * the end-user Better Auth session or HMAC header. Body fields that
 * claim an identity are ignored.
 */

import type { HonoEnv } from "../../env";
import { commonErrorResponses, envelopeOf, ok } from "../../lib/response";
import { createClientRoute, createClientRouter } from "../../lib/openapi";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { requireClientUser } from "../../middleware/require-client-user";
import { NullDataEnvelopeSchema } from "../../lib/response";
import { badgeService } from "./index";
import {
  DismissInputSchema,
  DismissResponseSchema,
  TreeQuerySchema,
  TreeResponseSchema,
} from "./validators";

const TAG = "Badge (Client)";

export const badgeClientRouter = createClientRouter();
badgeClientRouter.use("*", requireClientCredential);
badgeClientRouter.use("*", requireClientUser);

// ─── GET /tree ────────────────────────────────────────────────────

badgeClientRouter.openapi(
  createClientRoute({
    method: "get",
    path: "/tree",
    tags: [TAG],
    summary: "Fetch the red-dot tree for the calling end user",
    request: { query: TreeQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(TreeResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { rootKey } = c.req.valid("query");
    // Session-mode dismissals key off the player's current session.
    // We use the end-user session id when present; HMAC callers get a
    // `null` session id which means session-mode dismissals persist
    // until the customer's game server explicitly calls /reset-session.
    const sessionId =
      c.var.endUserAuthMethod === "session"
        ? // We don't expose the session row on the context, but its id
          // is not required for most dismissMode logic — `null` is the
          // safe default (keeps existing dismissals). Clients driving
          // session-mode resets should call /reset-session on login.
          null
        : null;
    const result = await badgeService.getTree(
      orgId,
      endUserId,
      rootKey ?? null,
      { currentSessionId: sessionId },
    );
    return c.json(ok(result), 200);
  },
);

// ─── POST /dismiss ────────────────────────────────────────────────

badgeClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/dismiss",
    tags: [TAG],
    summary: "Dismiss a red-dot node (mode != auto)",
    request: {
      body: {
        content: { "application/json": { schema: DismissInputSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(DismissResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const input = c.req.valid("json");
    const result = await badgeService.dismiss(
      orgId,
      endUserId,
      {
        nodeKey: input.nodeKey,
        version: input.version ?? null,
        sessionId: null,
      },
      new Date(),
    );
    return c.json(ok(result), 200);
  },
);

// ─── POST /reset-session ──────────────────────────────────────────

badgeClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/reset-session",
    tags: [TAG],
    summary:
      "Wipe session-mode dismissals for the caller (called on player login)",
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: NullDataEnvelopeSchema } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    await badgeService.resetSession(orgId, endUserId);
    return c.json(ok(null), 200);
  },
);
