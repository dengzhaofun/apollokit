/**
 * MCP module barrel.
 *
 * Unlike business modules (check-in, currency, …) this module has no
 * service layer, no schema, no DB writes — it's purely a transport
 * adapter that lets any MCP client (Claude.ai, Cursor, custom agent
 * hosts) talk to the existing admin API surface plus the docs site.
 *
 * See `routes.ts` for endpoint shape and `server.ts` for the lazy
 * per-request McpServer factory. Every tool lives in `tools/*.ts`.
 */

export { mcpRouter } from "./routes";
export { createMcpServer, MCP_SERVER_INFO } from "./server";
