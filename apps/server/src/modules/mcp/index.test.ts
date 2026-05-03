/**
 * MCP module tests.
 *
 * Two-layer split per `apps/server/CLAUDE.md`:
 *
 *   1. **In-memory MCP**: spin up the real `McpServer` with the real
 *      tools, paired to a `Client` via `InMemoryTransport`. Verifies
 *      tool registration, schema validation, and pure handler logic
 *      (echo, list_doc_modules) without any HTTP or admin worker
 *      dependencies. This is the load-bearing test.
 *
 *   2. **HTTP edge guard**: hits `/api/v1/mcp` via `app.request` to
 *      verify `requireAdminOrApiKey` rejects unauthenticated
 *      requests. We don't replay the full JSON-RPC handshake here —
 *      the in-memory test already covers protocol correctness, and
 *      reproducing Streamable HTTP's SSE response in vitest is
 *      heavy for marginal value.
 *
 * Docs tools that fetch admin (`search_docs`, `read_doc`) are
 * exercised manually pre-merge against a running admin worker (see
 * the plan's "Manual" verification section). Mocking `global.fetch`
 * to return Fumadocs Orama hits would test our adapter layer but
 * not the integration with admin's actual response shape, which is
 * exactly the contract that's worth catching breakage in.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import app from "../../index";
import { createMcpServer, MCP_SERVER_INFO } from "./server";

describe("mcp in-memory roundtrip", () => {
  let client: Client;

  beforeAll(async () => {
    const server = createMcpServer();
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    client = new Client(
      { name: "mcp-test-client", version: "0.0.0" },
      { capabilities: {} },
    );
    await client.connect(clientTransport);
  });

  afterAll(async () => {
    await client.close();
  });

  test("server identifies itself", async () => {
    expect(MCP_SERVER_INFO.name).toBe("apollokit");
    expect(client.getServerVersion()?.name).toBe("apollokit");
  });

  test("lists exactly the four phase-1 tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "echo",
      "list_doc_modules",
      "read_doc",
      "search_docs",
    ]);
  });

  test("echo returns the input verbatim", async () => {
    const r = await client.callTool({
      name: "echo",
      arguments: { message: "hello mcp" },
    });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent).toEqual({ message: "hello mcp" });
  });

  test("list_doc_modules returns the six documented sections", async () => {
    const r = await client.callTool({
      name: "list_doc_modules",
      arguments: {},
    });
    expect(r.isError).toBeFalsy();
    const sc = r.structuredContent as {
      sections: Array<{ section: string; modules: Array<{ slug: string }> }>;
    };
    expect(sc.sections.map((s) => s.section).sort()).toEqual([
      "content",
      "economy",
      "integration",
      "live-ops",
      "social",
      "system",
    ]);
    // Spot-check a known module is in the right section
    const economy = sc.sections.find((s) => s.section === "economy");
    expect(economy?.modules.some((m) => m.slug === "currency")).toBe(true);
  });

  test("validation: search_docs rejects empty query", async () => {
    const r = await client.callTool({
      name: "search_docs",
      arguments: { query: "" },
    });
    // Zod validation failure surfaces as a tool error (isError: true)
    // rather than throwing — clients see the error inline.
    expect(r.isError).toBe(true);
  });
});

describe("mcp HTTP edge", () => {
  test("401 without cookie or admin api key", async () => {
    const res = await app.request("/api/v1/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "edge-test", version: "0.0.0" },
        },
      }),
    });
    expect(res.status).toBe(401);
  });
});
