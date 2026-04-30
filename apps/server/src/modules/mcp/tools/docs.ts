/**
 * Docs tools for the MCP server.
 *
 * Reuses the implementation functions from
 * `modules/admin-agent/tools/docs.ts`. Both transports (the in-product
 * AI agent and the public MCP endpoint) hit the same ADMIN_URL fetch
 * paths, so the actual fetch / truncation logic lives there.
 *
 * This file is just MCP-flavored tool registration: it shapes input
 * schemas, picks tool names (snake_case per MCP convention), and
 * formats responses as the MCP `CallToolResult` shape (a `content`
 * array of typed parts plus optional `structuredContent`).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  DOC_LOCALES,
  runReadDoc,
  runSearchDocs,
} from "../../admin-agent/tools/docs";
import { DOC_MODULES, SECTION_LABELS } from "../manifest";

export function registerDocTools(server: McpServer) {
  server.registerTool(
    "search_docs",
    {
      title: "Search ApolloKit documentation",
      description:
        "Search ApolloKit's developer documentation (Fumadocs, en + zh). " +
        "Use when the user asks how a feature works, what a field means, " +
        "or for best-practice guidance. Returns matching headings/sections " +
        "with URLs you can cite. For a known doc, prefer `read_doc` to " +
        "fetch the full page directly.",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe(
            "Search keywords. Chinese or English; the index has both.",
          ),
        locale: z
          .enum(DOC_LOCALES)
          .default("zh")
          .describe(
            "Doc language. Default 'zh'. Pick based on the user's input language.",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(10)
          .default(5)
          .describe("Max results to return."),
      },
    },
    async ({ query, locale, limit }) => {
      const result = await runSearchDocs({ query, locale, limit });
      if (!result.ok) {
        return {
          isError: true,
          content: [{ type: "text", text: result.error }],
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(result.results) }],
        structuredContent: { results: result.results },
      };
    },
  );

  server.registerTool(
    "read_doc",
    {
      title: "Read a documentation page",
      description:
        "Fetch the full markdown of one ApolloKit documentation page. " +
        "Use after `search_docs` (or after spotting a relevant URL from a " +
        "prior tool call) to read the complete content before answering.",
      inputSchema: {
        path: z
          .string()
          .min(1)
          .describe(
            "Doc path under /docs-md, e.g. 'zh/check-in' or 'en/lottery'. " +
              "If you have a URL like /docs/zh/check-in from search results, " +
              "strip the leading '/docs/' to get the path.",
          ),
      },
    },
    async ({ path }) => {
      const result = await runReadDoc({ path });
      if (!result.ok) {
        return {
          isError: true,
          content: [{ type: "text", text: result.error }],
        };
      }
      return {
        content: [{ type: "text", text: result.markdown }],
        structuredContent: { path: result.path, markdown: result.markdown },
      };
    },
  );

  server.registerTool(
    "list_doc_modules",
    {
      title: "List documented ApolloKit modules",
      description:
        "List every documented ApolloKit feature module, grouped by " +
        "category (Economy / Live Ops / Social / Content / System / " +
        "Integration). Use this to answer 'what does ApolloKit support' " +
        "or to discover relevant modules before calling `read_doc`.",
      inputSchema: {},
    },
    async () => {
      const grouped = DOC_MODULES.reduce<
        Record<
          string,
          {
            section: string;
            sectionLabel: { zh: string; en: string };
            modules: Array<{ slug: string; label: { zh: string; en: string } }>;
          }
        >
      >((acc, m) => {
        const bucket = (acc[m.section] ??= {
          section: m.section,
          sectionLabel: SECTION_LABELS[m.section],
          modules: [],
        });
        bucket.modules.push({ slug: m.slug, label: m.label });
        return acc;
      }, {});
      const sections = Object.values(grouped);
      return {
        content: [{ type: "text", text: JSON.stringify(sections) }],
        structuredContent: { sections },
      };
    },
  );
}
