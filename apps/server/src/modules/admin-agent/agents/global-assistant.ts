/**
 * `global-assistant` agent — drives the bottom-right floating chat.
 *
 * Behavior policy:
 *   - patch* tools are the **propose** variant (same as form-fill):
 *     model emits `{key, patch}` proposal, frontend renders
 *     `PatchConfigCard` with diff + 确认/取消 buttons, user confirms
 *     before any HTTP/DB write happens.
 *   - apply* (create a new resource) is intentionally **not** exposed —
 *     creating a new resource by chat is too easy to misuse, and the
 *     in-form sidebar (form-fill agent) is the right place for that flow.
 *
 * Why propose-then-confirm even though "global" implies "execute":
 *   The original aspiration was server-side `execute` for zero-click
 *   write through. Empirically both Kimi K2 and DeepSeek V3.1 hallucinate
 *   extra fields in the patch payload (e.g. user says "把它关闭" → model
 *   emits `{isActive:false, weekStartsOn:1, timezone:"UTC"}`,
 *   destructively overwriting the original timezone). System-prompt
 *   pressure ("only fields the user asked") is consistently ignored.
 *   Until model trust is established, we gate every write behind a
 *   one-click user confirm. The agent split (different prompt, no
 *   apply tool, different surface) is preserved for future agents and
 *   for re-enabling execute when models prove reliable.
 */

import { stepCountIs } from "ai";

import { buildGlobalAssistantSystemPrompt } from "../prompts";
import { buildBaseTools, buildPatchTools } from "../tools";
import type { ChatExecutionContext } from "../types";
import { DEFAULT_MODEL_ID } from "./form-fill";
import type { AgentDefinition } from "./types";

export function createGlobalAssistantAgent(
  execCtx: ChatExecutionContext,
): AgentDefinition {
  return {
    name: "global-assistant",
    modelId: DEFAULT_MODEL_ID,
    stopWhen: stepCountIs(8),
    async buildSystem(input) {
      return buildGlobalAssistantSystemPrompt(input);
    },
    buildTools({ mentionedModuleIds }) {
      return {
        ...buildBaseTools(execCtx),
        ...buildPatchTools(mentionedModuleIds, "propose"),
      };
    },
  };
}
