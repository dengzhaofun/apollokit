/**
 * Documentation tools for the admin agent.
 *
 * Backed by the admin worker's existing Fumadocs endpoints:
 *   - `/api/search`            → Orama bilingual search (en/zh, mandarin tokenizer)
 *   - `/docs-md/<lang>/<slug>` → single page as raw processed markdown
 *   - `/llms.txt`              → short TOC (titles + URLs + descriptions)
 *
 * **Why fetch instead of share code:** the docs source (Fumadocs MDX)
 * lives in the admin Worker's bundle and depends on Vite plugin
 * compile-time injection (`postprocess.includeProcessedMarkdown`). It
 * cannot be re-instantiated cheaply in the server worker. The
 * cross-worker fetch goes Worker → Worker (same Cloudflare PoP in prod,
 * localhost-to-localhost in dev) so the latency cost is small.
 *
 * **Why two tools, not one search:** docs questions split into two
 * shapes —
 *   1. "What pages are about X?" — search
 *   2. "Explain field Y from doc Z" — direct page read (the BASE_PROMPT
 *      injects the TOC, so the AI usually knows the slug without
 *      searching)
 * Splitting the API matches the model's natural call pattern and keeps
 * each tool's response small enough to fit in context.
 */

import { env } from "cloudflare:workers";
import { tool } from "ai";
import { z } from "zod";

/** Fumadocs `SortedResult` shape — copied to avoid a cross-app import. */
type SortedResult = {
  id: string;
  url: string;
  type: "page" | "heading" | "text";
  content: string;
};

const DOC_LOCALES = ["zh", "en"] as const;
type DocLocale = (typeof DOC_LOCALES)[number];

function adminBaseUrl(): string {
  const url = (env as unknown as { ADMIN_URL?: string }).ADMIN_URL;
  if (!url) {
    // ADMIN_URL is declared as a plain `vars` entry in
    // `apps/server/wrangler.jsonc`, so it should always be present.
    // Fall back to localhost dev to avoid hard-failing the agent if
    // misconfigured — searchDocs/readDoc will simply return errors.
    return "http://localhost:3000";
  }
  return url.replace(/\/+$/, "");
}

/**
 * Per-isolate, **per-locale** cache of the docs TOC.
 *
 * Why per-locale: `/llms.txt` upstream concatenates ZH + EN with a
 * `\n\n---\n\n` divider; the full payload is ~96KB / ~21K tokens.
 * Injecting both languages every request roughly doubles input cost
 * for negligible value (the user almost always reads in one language).
 * We slice to one half on the server side — splitting on the `---`
 * divider — and cache each locale's slice separately so a session
 * that switches language gets a fresh slice without re-fetching.
 *
 * Isolates respawn on deploy and after idle, so the cache naturally
 * picks up doc updates within ~minutes; no explicit TTL.
 */
const _docsTocCache: Map<DocLocale, Promise<string>> = new Map();

/** Headings the upstream `/llms.txt` route emits per locale. */
const LOCALE_HEADINGS: Record<DocLocale, string> = {
  zh: "# ApolloKit 开发者文档",
  en: "# ApolloKit Developer Docs",
};

/**
 * Extract one locale's section from the concatenated `/llms.txt`.
 * Format upstream is `<heading>\n\n<index>\n\n---\n\n<heading>\n\n<index>`.
 * Splitting on `\n\n---\n\n` yields the two top-level sections; we
 * pick the one starting with our locale's heading.
 */
function extractLocaleSection(full: string, locale: DocLocale): string {
  const heading = LOCALE_HEADINGS[locale];
  const sections = full.split(/\n\n---\n\n/);
  const match = sections.find((s) => s.trimStart().startsWith(heading));
  // Fallback: if format ever changes (heading rename / divider differs),
  // return the full text rather than nothing — over-injecting is safer
  // than silently dropping the entire docs index.
  return match ?? full;
}

export async function loadDocsToc(locale: DocLocale = "zh"): Promise<string> {
  const cached = _docsTocCache.get(locale);
  if (cached) return cached;
  const promise = (async () => {
    try {
      const res = await fetch(`${adminBaseUrl()}/llms.txt`);
      if (!res.ok) return "";
      const full = await res.text();
      return extractLocaleSection(full, locale);
    } catch (err) {
      console.warn("[admin-agent] loadDocsToc failed:", err);
      return "";
    }
  })();
  _docsTocCache.set(locale, promise);
  return promise;
}

/** Test-only helper to reset the cached TOC between tests. */
export function __resetDocsTocCacheForTests() {
  _docsTocCache.clear();
}

export const searchDocs = tool({
  description:
    "Search ApolloKit admin/SDK documentation (Fumadocs MDX, en + zh). " +
    "Use this when the user asks how a feature works, what a field means, " +
    "or for best-practice guidance — anything the BASE_PROMPT TOC alone " +
    "doesn't answer. Returns matching headings/sections with URLs you " +
    "can cite. For a known doc you've already identified from the TOC, " +
    "prefer `readDoc` to fetch the full page directly. " +
    "搜索 ApolloKit 文档(中英双语):用户问字段含义/如何配置/最佳实践时调这个。",
  inputSchema: z.object({
    query: z
      .string()
      .min(1)
      .describe("Search keywords. Chinese or English; the index has both."),
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
  }),
  execute: async ({ query, locale, limit }) => {
    const url = new URL(`${adminBaseUrl()}/api/search`);
    url.searchParams.set("query", query);
    url.searchParams.set("locale", locale);
    const res = await fetch(url);
    if (!res.ok) {
      return {
        ok: false as const,
        error: `search failed: HTTP ${res.status}`,
      };
    }
    const hits = (await res.json()) as SortedResult[];
    return {
      ok: true as const,
      results: hits.slice(0, limit).map((h) => ({
        url: h.url,
        type: h.type,
        // Trim long highlights — the model only needs enough to decide
        // which page to readDoc next.
        content:
          h.content.length > 280 ? h.content.slice(0, 280) + "…" : h.content,
      })),
    };
  },
});

export const readDoc = tool({
  description:
    "Fetch the full markdown of one documentation page. Use this after " +
    "`searchDocs` (or after spotting a relevant URL in the BASE_PROMPT TOC) " +
    "to read the complete content before answering. " +
    "读取一篇文档的完整 markdown,先 searchDocs 拿 url 再调本工具。",
  inputSchema: z.object({
    path: z
      .string()
      .min(1)
      .describe(
        "Doc path under /docs-md, e.g. 'zh/check-in' or 'en/lottery'. " +
          "If you have a URL like /docs/zh/check-in from search results, " +
          "strip the leading '/docs/' to get the path.",
      ),
  }),
  execute: async ({ path }) => {
    // Normalize: tolerate both 'zh/check-in' and '/docs/zh/check-in'.
    const cleaned = path.replace(/^\/?(docs\/)?/, "").replace(/^\/+/, "");
    const res = await fetch(`${adminBaseUrl()}/docs-md/${cleaned}`);
    if (!res.ok) {
      return {
        ok: false as const,
        error: `doc not found: ${cleaned} (HTTP ${res.status})`,
      };
    }
    const markdown = await res.text();
    // Hard cap to keep one page from blowing context — pages over this
    // size should be summarized in pieces (the model can re-call with
    // more specific search terms). Picked to fit comfortably with
    // multi-page reads under Kimi's 256K window.
    const MAX_DOC_CHARS = 40_000;
    return {
      ok: true as const,
      path: cleaned,
      markdown:
        markdown.length > MAX_DOC_CHARS
          ? markdown.slice(0, MAX_DOC_CHARS) +
            "\n\n…[truncated; call readDoc with a more specific path or use searchDocs to narrow down]"
          : markdown,
    };
  },
});

export const DOC_TOOL_NAMES = ["searchDocs", "readDoc"] as const;
