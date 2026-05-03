/**
 * MCP HTTP endpoint.
 *
 * Exposes `/api/v1/mcp` as a Streamable HTTP MCP transport (the 2025-03
 * spec — single endpoint, request/response per JSON-RPC message, no
 * long-lived SSE). This is the right transport for Cloudflare Workers:
 * stateless, no keep-alive, no per-connection memory.
 *
 * **Why this router does NOT use `OpenAPIHono` / the standard envelope:**
 *
 * Same rationale as `modules/admin-agent/routes.ts`. The wire format
 * here is JSON-RPC 2.0 (or its streaming variant), defined by the MCP
 * spec — it cannot be wrapped in our `{code, data, message, requestId}`
 * envelope without breaking every off-the-shelf MCP client. OpenAPI
 * also can't usefully describe JSON-RPC method dispatch via tool name,
 * so we deliberately keep this endpoint out of `openapi.json`.
 *
 * **Auth:** `requireAdminOrApiKey` runs per-router (not global) — same
 * pattern as every other admin-side router. Both Better Auth session
 * (so an operator can hit this endpoint from inside the admin UI for
 * testing) and `ak_…` admin API keys are accepted. The MCP spec's own
 * auth flow (OAuth resource metadata) is intentionally NOT used: our
 * users already have admin API keys, and re-doing auth at the MCP
 * layer would be a parallel system to maintain.
 *
 * **Per-request server:** we build a fresh `McpServer` + transport on
 * every hit. See `server.ts` for the rationale (Workers startup CPU,
 * stateless transport, no caching to be had).
 */

import { StreamableHTTPTransport } from "@hono/mcp";
import { Hono } from "hono";

import type { HonoEnv } from "../../env";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key";
import { createMcpServer } from "./server";

export const mcpRouter = new Hono<HonoEnv>();

mcpRouter.use("*", requireAdminOrApiKey);

mcpRouter.all("/", async (c) => {
  const transport = new StreamableHTTPTransport();
  const server = createMcpServer();
  await server.connect(transport);
  return transport.handleRequest(c);
});
