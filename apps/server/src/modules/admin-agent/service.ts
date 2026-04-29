import { env } from "cloudflare:workers";
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";

import type { AppDeps } from "../../deps";
import { getMention } from "./mentions/registry";
import type {
  MentionRef,
  MentionSnapshot,
} from "./mentions/types";
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
      // Resolve any @-mentions in parallel with the rest of the prep.
      // `resolveMentions` is org-scoped and tolerates missing/stale
      // refs (returns a "已失效" snapshot instead of throwing) so the
      // chat can proceed even if the user mentioned something that
      // was deleted between popover-select and submit.
      const [modelMessages, baseSystem, snapshots] = await Promise.all([
        // `convertToModelMessages` is async in AI SDK v6 (it may need to
        // resolve file parts / data parts), so this whole call is async.
        convertToModelMessages(messages),
        // `buildSystemPrompt` is also async because it inlines the docs
        // TOC (cached per isolate per locale, so cold-start only).
        buildSystemPrompt(context.surface, context.draft, locale),
        resolveMentions(execCtx.organizationId, context.mentions ?? []),
      ]);

      const mentionSection = buildMentionSystemSection(snapshots);
      const system = mentionSection ? `${baseSystem}\n\n${mentionSection}` : baseSystem;

      // Tool extras: each mentioned resource's descriptor may declare a
      // `toolModuleId` to enable. Dedupe so the same module mentioned
      // twice doesn't double-register (it's idempotent anyway, but tidy).
      const extraToolModules = Array.from(
        new Set(
          snapshots
            .map((s) => s.toolModuleId)
            .filter((m): m is string => m != null),
        ),
      );

      return streamText({
        model: d.ai.model(resolveModelId()),
        system,
        messages: modelMessages,
        tools: buildToolsForSurface(
          context.surface,
          execCtx,
          extraToolModules,
        ),
        // Bound the agent's reasoning budget. With askClarification /
        // applyConfig / readDoc as the main outcomes, ~8 steps allows
        // a searchDocs → readDoc → answer chain to complete; beyond
        // that the model is usually looping.
        stopWhen: stepCountIs(8),
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

/**
 * Format the mentioned-resource lookup table for the LLM system prompt.
 *
 * The user message keeps natural text ("@7日签到 帮我关闭它") — this
 * section tells the model what each `@<name>` actually refers to and
 * what tool to call for changes. Returns `null` when no mentions exist
 * so the caller skips concatenation.
 */
export function buildMentionSystemSection(
  snapshots: MentionSnapshot[],
): string | null {
  if (snapshots.length === 0) return null;
  const lines = snapshots.map((s) => `- ${s.contextLine}`);
  return [
    "## 当前对话引用的资源 (@-mentions)",
    "用户在消息中以 @<name> 形式引用了下列资源：",
    "",
    ...lines,
    "",
    "### 如何对 @资源 执行操作",
    "**修改现有资源**（关闭、重命名、改字段、调时间等）→ 用 **patch* tool**（如 `patchCheckInConfig`）：",
    "  - `key` 字段填上面 (id=...) 或 (alias=...) 里的值",
    "  - `patch` 字段**只放用户明确要改的字段**，其它一概不要带（不要把上面 context 里的字段全抄过去重写）",
    "  - 例：用户说\"关闭它\" → `patchCheckInConfig({ key: 'cfg_xxx', patch: { isActive: false } })`，**不要**带 name/resetMode/timezone 这些没说要改的字段",
    "**新建一个类似的资源** → 才用 apply* tool（apply 是回填创建表单用的，要求所有必需字段；用错会覆盖原配置）",
    "**只是想看资源详情** → 用 describeConfig",
  ].join("\n");
}
