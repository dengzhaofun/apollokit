import { env } from "cloudflare:workers";
import {
  createAgentUIStreamResponse,
  ToolLoopAgent,
  type UIMessage,
} from "ai";

import type { AppDeps } from "../../deps";
import { agentExecDeps } from "./agents/exec-deps";
import { createAgentForRequest } from "./agents/registry";
import type { AgentToolContext } from "./agents/types";
import { getMention } from "./mentions/registry";
import type {
  MentionRef,
  MentionSnapshot,
} from "./mentions/types";
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
      .map((p) =>
        p.type === "text" && typeof p.text === "string" ? p.text : "",
      )
      .join("");
    if (!text) continue;
    return /[一-鿿]/.test(text) ? "zh" : "en";
  }
  return "zh";
}

type AdminAgentDeps = Pick<AppDeps, "ai">;

/**
 * Single AI agent service for the entire admin dashboard. Tools and
 * prompt are resolved per-request from `context.surface` + `agentName`,
 * so adding a new module's AI assist or a new agent does NOT require a
 * new HTTP endpoint — only a tool + prompt registration in `tools/` and
 * `prompts.ts`, and (for new agents) one entry in `agents/registry.ts`.
 *
 * The model id is configurable via `OPENROUTER_ADMIN_AGENT_MODEL` (env
 * var; OpenRouter region-blocks vary by upstream provider — OpenAI and
 * Anthropic models are blocked in mainland China, Moonshot/Qwen/DeepSeek
 * work). Default per agent definition; current default is
 * `deepseek/deepseek-chat-v3.1` (DeepSeek V3.1 — strong tool-calling +
 * tight instruction-following, region-unblocked).
 */
function resolveModelId(defaultId: string): string {
  // Cast through `unknown`: `OPENROUTER_ADMIN_AGENT_MODEL` is an
  // optional secret that Cloudflare's typegen doesn't know about until
  // someone runs `pnpm cf-typegen` after adding it. Treat absent as
  // "use default" rather than failing the build.
  const fromEnv = (env as unknown as Record<string, string | undefined>)
    .OPENROUTER_ADMIN_AGENT_MODEL;
  return fromEnv ?? defaultId;
}

export type AdminAgentService = ReturnType<typeof createAdminAgentService>;

export function createAdminAgentService(d: AdminAgentDeps) {
  return {
    /**
     * `execCtx` carries the per-request `tenantId` from the route
     * handler (read from the Hono session). Patch tools' `execute`
     * callbacks read it from `experimental_context` (set on the
     * `ToolLoopAgent` constructor below). Query tools still use closures
     * because they're stateless module-level singletons would break the
     * existing test surface — that's a deliberate trade-off, not an
     * inconsistency.
     */
    async streamChat(
      { messages, context, agentName }: ChatRequestBody,
      execCtx: ChatExecutionContext,
    ) {
      // Detect user's input locale from their latest message so the
      // system prompt can inline only the matching docs TOC slice
      // (~10K tokens per locale vs ~21K for both). Heuristic: any CJK
      // codepoint in the last user message means Chinese; everything
      // else defaults to English. Cheap and good enough.
      const locale = detectUserLocale(messages);
      // Resolve any @-mentions before composing prompts/tools.
      // `resolveMentions` is org-scoped and tolerates missing/stale
      // refs (returns a "已失效" snapshot instead of throwing) so the
      // chat can proceed even if the user mentioned something that
      // was deleted between popover-select and submit.
      const snapshots = await resolveMentions(
        execCtx.tenantId,
        context.mentions ?? [],
      );

      // Tool extras: each mentioned resource's descriptor may declare a
      // `toolModuleId` to enable. Dedupe so the same module mentioned
      // twice doesn't double-register (idempotent anyway, but tidy).
      const mentionedModuleIds = Array.from(
        new Set(
          snapshots
            .map((s) => s.toolModuleId)
            .filter((m): m is string => m != null),
        ),
      );

      const def = createAgentForRequest(agentName, execCtx);
      const system = await def.buildSystem({
        surface: context.surface,
        draft: context.draft,
        mentions: snapshots,
        locale,
      });
      const buildToolsInput = {
        surface: context.surface,
        mentionedModuleIds,
      };
      const tools = def.buildTools(buildToolsInput);
      const toolChoice = def.buildToolChoice?.(buildToolsInput);

      // Per-request data threaded into tool `execute` callbacks via AI
      // SDK v6's `experimental_context`. Tools read it via the second
      // arg of `execute` (`{ experimental_context }`). Set on the agent
      // constructor — `ToolLoopAgentSettings` carries it directly.
      const toolContext: AgentToolContext = {
        execCtx,
        deps: agentExecDeps,
      };

      const agent = new ToolLoopAgent({
        model: d.ai.model(resolveModelId(def.modelId)),
        instructions: system,
        tools,
        ...(toolChoice ? { toolChoice } : {}),
        stopWhen: def.stopWhen,
        experimental_context: toolContext,
      });

      // `createAgentUIStreamResponse` validates the incoming UI messages,
      // converts them to model messages internally, runs the agent's
      // `.stream()`, and returns a streaming `Response`. The route
      // handler returns this Response directly.
      return createAgentUIStreamResponse({
        agent,
        uiMessages: messages,
      });
    },
  };
}

/**
 * Re-fetch the authoritative resource for each @-mention from its module
 * service. We don't trust the frontend's snapshot:
 *   - the user may have stalled between selecting and submitting, so
 *     status/fields may have changed,
 *   - the descriptor may have richer fields than the popover row.
 *
 * Always org-scoped via `descriptor.fetch(orgId, id)`. Cross-tenant
 * access is impossible by construction.
 *
 * Failure modes are converted to a "[已失效]" snapshot rather than
 * thrown — the chat must continue even if the user mentioned a deleted
 * resource. Unknown types (front-end / back-end registry drift) are
 * skipped silently.
 */
export async function resolveMentions(
  orgId: string,
  refs: MentionRef[],
): Promise<MentionSnapshot[]> {
  if (refs.length === 0) return [];

  const settled = await Promise.allSettled(
    refs.map(async (ref): Promise<MentionSnapshot | null> => {
      const descriptor = getMention(ref.type);
      if (!descriptor) return null;
      try {
        const resource = await descriptor.fetch(orgId, ref.id);
        if (resource == null) {
          return {
            ref,
            resource: null,
            contextLine: `[${ref.type}] (id=${ref.id}) [已失效或被删除]`,
            toolModuleId: descriptor.toolModuleId,
          };
        }
        return {
          ref,
          resource,
          contextLine: descriptor.toContextLine(resource),
          toolModuleId: descriptor.toolModuleId,
        };
      } catch {
        return {
          ref,
          resource: null,
          contextLine: `[${ref.type}] (id=${ref.id}) [无法读取]`,
          toolModuleId: descriptor.toolModuleId,
        };
      }
    }),
  );

  return settled
    .map((r) => (r.status === "fulfilled" ? r.value : null))
    .filter((s): s is MentionSnapshot => s != null);
}
