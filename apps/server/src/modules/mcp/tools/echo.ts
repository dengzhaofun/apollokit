/**
 * Smoke-test tool. Always present, tiny, no IO. Lets integrators
 * verify their MCP client is talking to the right server end-to-end
 * (transport + auth + tool dispatch) without depending on docs being
 * online or a particular module's data shape.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerEchoTool(server: McpServer) {
  server.registerTool(
    "echo",
    {
      title: "Echo a message back",
      description:
        "Returns the input message verbatim. Useful for verifying that " +
        "your MCP client can reach this server and that authentication " +
        "is working. Not used in normal workflows.",
      inputSchema: {
        message: z
          .string()
          .min(1)
          .describe("Any string. Will be returned as-is."),
      },
    },
    async ({ message }) => ({
      content: [{ type: "text", text: message }],
      structuredContent: { message },
    }),
  );
}
