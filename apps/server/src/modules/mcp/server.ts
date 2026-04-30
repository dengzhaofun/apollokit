/**
 * MCP server factory.
 *
 * **Why a factory and not a module-level singleton:** the `McpServer`
 * instance carries per-tool registrations as Zod schemas. Doing that
 * work eagerly at import time is a real risk on Cloudflare Workers —
 * we already hit the worker startup CPU limit once (commit 8b04222
 * fixed via wrangler `--minify`), and a top-level `new McpServer(...)`
 * + N `registerTool(...)` calls would push us closer again. Building
 * one server per request keeps startup cost off the cold path.
 *
 * The server itself is cheap to construct (no IO, just an object with
 * a registry map). The transport (`@hono/mcp` `StreamableHTTPTransport`)
 * is also stateless — it lives for one request, handles one JSON-RPC
 * payload, and gets discarded. This matches the Workers execution
 * model exactly; do NOT try to cache the server across requests.
 *
 * **What the server exposes:** every tool registered here is callable
 * by any MCP client connecting to `/api/mcp` with a valid admin API
 * key. Tools should be written with the assumption that the caller is
 * an LLM or a small wrapper around one — descriptions matter.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerDocTools } from "./tools/docs";
import { registerEchoTool } from "./tools/echo";

export const MCP_SERVER_INFO = {
  name: "apollokit",
  version: "0.1.0",
  title: "ApolloKit",
} as const;

export function createMcpServer(): McpServer {
  const server = new McpServer(MCP_SERVER_INFO, {
    capabilities: {
      tools: {},
    },
  });

  registerEchoTool(server);
  registerDocTools(server);

  return server;
}
