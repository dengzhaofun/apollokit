/**
 * `form-fill` agent — drives the in-form AI sidebar.
 *
 * Behavior policy:
 *   - patch* tools are the **propose** variant (no `execute`); the model
 *     emits `{key, patch}` and the FE renders `PatchConfigCard` for the
 *     user to confirm before any write.
 *   - apply* tool is propose-only by construction (apply tools fill the
 *     surface's create form — no DB write here either).
 *   - All base tools (askClarification, navigateTo, search/readDocs,
 *     query tools) are exposed as usual.
 */

import { stepCountIs } from "ai";

import { buildFormFillSystemPrompt } from "../prompts";
import { buildApplyTool, buildBaseTools, buildPatchTools } from "../tools";
import type { ChatExecutionContext } from "../types";
import type { AgentDefinition } from "./types";

/**
 * Default model for admin-agent. DeepSeek V3.1 chosen because:
 *   - Region-unblocked for mainland-China-based OpenRouter accounts
 *     (OpenAI / Anthropic / some Google models are blocked there).
 *   - Tighter instruction-following than Kimi K2 — empirically Kimi
 *     hallucinated extra patch fields (`"把它关闭"` → patched isActive
 *     PLUS timezone PLUS weekStartsOn, destructively overwriting the
 *     user's timezone). DeepSeek follows the system prompt's
 *     "only-the-fields-the-user-asked" rule reliably.
 *   - Strong native tool-calling; reliably picks `applyXxxConfig` /
 *     `patchXxxConfig` over text-only completions.
 *   - Fast enough for streaming UI (vs reasoning models like Kimi K2.6
 *     that emit long reasoning before any visible content).
 *
 * Override per-deploy via `OPENROUTER_ADMIN_AGENT_MODEL` env var
 * (see `service.ts: resolveModelId`).
 */
export const DEFAULT_MODEL_ID = "deepseek/deepseek-chat-v3.1";

export function createFormFillAgent(
  execCtx: ChatExecutionContext,
): AgentDefinition {
  return {
    name: "form-fill",
    modelId: DEFAULT_MODEL_ID,
    stopWhen: stepCountIs(8),
    async buildSystem(input) {
      return buildFormFillSystemPrompt(input);
    },
    buildTools({ surface, mentionedModuleIds }) {
      return {
        ...buildBaseTools(execCtx),
        ...buildApplyTool(surface),
        ...buildPatchTools(mentionedModuleIds, "propose"),
      };
    },
  };
}
