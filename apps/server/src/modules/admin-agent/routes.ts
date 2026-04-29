/**
 * Admin AI agent — single chat endpoint shared across all admin modules.
 *
 * **Why this router does NOT use the standard envelope or `OpenAPIHono`:**
 *
 * Every other business endpoint returns the `{code, data, message,
 * requestId}` envelope wrapped via `createAdminRouter` + `envelopeOf`,
 * and is therefore registered in the OpenAPI spec and codegen'd into the
 * SDK. This endpoint is the ONLY exception (parallel to `/api/auth/*`),
 * because:
 *
 *   1. The response is a UI message stream (SSE chunks) which an envelope
 *      cannot wrap — it would force the frontend to JSON-parse the entire
 *      stream first, defeating the purpose of streaming.
 *   2. OpenAPI cannot express SSE chunk schemas, so registering it would
 *      generate a misleading SDK type.
 *
 * The admin frontend therefore calls this endpoint via raw `fetch` (the
 * AI SDK's `useChat` transport), not via the generated SDK.
 *
 * **Auth & multi-tenancy:** `requireAuth` already runs per-router below
 * and re-uses the global `session` middleware mounted in `index.ts`, so
 * cookie-based admin auth works exactly like every other admin route.
 *
 * **Surface gating:** the body's `context.surface` is enforced against
 * `ADMIN_SURFACES` here so a buggy or malicious frontend can't request
 * tools it shouldn't have.
 */

import { Hono } from "hono";

import type { HonoEnv } from "../../env";
import { requireAuth } from "../../middleware/require-auth";
import { adminAgentService } from "./index";
import { mentionsRouter } from "./mentions/routes";
import { isAdminSurface, type ChatRequestBody } from "./types";

export const adminAgentRouter = new Hono<HonoEnv>();
adminAgentRouter.use("*", requireAuth);

// /api/ai/admin/mentions/* — type registry + entity search for the @-mention popover.
adminAgentRouter.route("/mentions", mentionsRouter);

adminAgentRouter.post("/chat", async (c) => {
  let body: ChatRequestBody;
  try {
    body = (await c.req.json()) as ChatRequestBody;
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  if (!body || typeof body !== "object") {
    return c.json({ error: "invalid_body" }, 400);
  }
  if (!Array.isArray(body.messages)) {
    return c.json({ error: "invalid_messages" }, 400);
  }
  if (!body.context || !isAdminSurface(body.context.surface)) {
    return c.json({ error: "invalid_surface" }, 400);
  }

  // requireAuth has already guaranteed both `user` and an active org.
  const organizationId = c.var.session?.activeOrganizationId;
  if (!organizationId) {
    // Defensive — should be unreachable past requireAuth.
    return c.json({ error: "no_active_organization" }, 400);
  }

  const result = await adminAgentService.streamChat(body, { organizationId });
  return result.toUIMessageStreamResponse();
});
