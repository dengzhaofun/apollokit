import { env } from "cloudflare:workers";
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";

import type { AppDeps } from "../../deps";
import { buildSystemPrompt } from "./prompts";
import { buildToolsForSurface } from "./tools";
import type { ChatExecutionContext, ChatRequestBody } from "./types";

/**
 * Detect input locale from the **latest** user message. Used to pick
 * which docs TOC slice to inject. Cheap heuristic:
 *   - any CJK ideograph in the text → 'zh'
 *   - otherwise → 'en'
 *
 * Why latest user message (not first): users often start a session in
 * one language and switch — we want the current message's language to
 * win. Looking only at the last user turn keeps the rule simple.
 *
 * Default 'zh' on no-text-found: the product is Chinese-first; the
 * empty / image-only case is vanishingly rare in this admin context
 * (users describe configs in text), so falling to 'zh' wastes nothing
 * for the typical reader.
 */
export function detectUserLocale(messages: UIMessage[]): "zh" | "en" {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role !== "user") continue;
    const text = (m.parts ?? [])
      .map((p) => {
        if (p.type !== "text") return "";
        // The discriminated `text` part has `text: string`; the runtime
        // typeof check appeases narrowing in case the union widens.
        const t = (p as { text?: unknown }).text;
        return typeof t === "string" ? t : "";
      })
      .join("");
    if (!text) continue;
    return /[一-鿿]/.test(text) ? "zh" : "en";
  }
  return "zh";
}

type AdminAgentDeps = Pick<AppDeps, "ai">;

/**
 * Model used for the admin agent. Configurable via the
 * `OPENROUTER_ADMIN_AGENT_MODEL` env var so each deployment can pick
 * a model that's actually available in its region (OpenRouter
 * region-blocks vary by upstream provider — OpenAI and Anthropic
 * models are blocked in mainland China, Google/Qwen/DeepSeek work).
 *
 * Default: `google/gemini-2.5-flash` — fast, cheap, strong at
 * structured-output/tool-calls, and broadly available.
 */
const DEFAULT_MODEL = "google/gemini-2.5-flash";

function resolveModelId(): string {
  // Cast through `unknown`: `OPENROUTER_ADMIN_AGENT_MODEL` is an
  // optional secret that Cloudflare's typegen doesn't know about until
  // someone runs `pnpm cf-typegen` after adding it. Treat absent as
  // "use default" rather than failing the build.
  const fromEnv = (env as unknown as Record<string, string | undefined>)
    .OPENROUTER_ADMIN_AGENT_MODEL;
  return fromEnv ?? DEFAULT_MODEL;
}

export type AdminAgentService = ReturnType<typeof createAdminAgentService>;

/**
 * Single AI agent for the entire admin dashboard. Tools and prompt are
 * resolved per-request from `context.surface`, so adding a new module's
 * AI assist does NOT require a new HTTP endpoint — only a tool + prompt
 * registration in `tools/` and `prompts.ts`.
 */
export function createAdminAgentService(d: AdminAgentDeps) {
  return {
    /**
     * `execCtx` carries the per-request `organizationId` from the route
     * handler (read from the Hono session). Query tools' `execute`
     * closures need it to scope DB reads to the right tenant — passing
     * it explicitly is more robust than relying on AsyncLocalStorage
     * propagation across the streamText / SSE boundary.
     */
    async streamChat(
      { messages, context }: ChatRequestBody,
      execCtx: ChatExecutionContext,
    ) {
      // Detect user's input locale from their latest message so the
      // system prompt can inline only the matching docs TOC slice
      // (~10K tokens per locale vs ~21K for both). Heuristic: any CJK
      // codepoint in the last user message means Chinese; everything
      // else defaults to English. Cheap and good enough.
      const locale = detectUserLocale(messages);
      // `convertToModelMessages` is async in AI SDK v6 (it may need to
      // resolve file parts / data parts), so this whole call is async.
      // `buildSystemPrompt` is also async because it inlines the docs
      // TOC (cached per isolate per locale, so cold-start only).
      const [modelMessages, system] = await Promise.all([
        convertToModelMessages(messages),
        buildSystemPrompt(context.surface, context.draft, locale),
      ]);
      return streamText({
        model: d.ai.model(resolveModelId()),
        system,
        messages: modelMessages,
        tools: buildToolsForSurface(context.surface, execCtx),
        // Bound the agent's reasoning budget. With askClarification /
        // applyConfig / readDoc as the main outcomes, ~8 steps allows
        // a searchDocs → readDoc → answer chain to complete; beyond
        // that the model is usually looping.
        stopWhen: stepCountIs(8),
      });
    },
  };
}
