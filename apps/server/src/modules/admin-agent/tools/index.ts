/**
 * Compose the tool set exposed to the model for a given surface.
 *
 * Always exposed:
 *   - `askClarification` (shared)
 *   - 3 query tools (queryModule / describeConfig / analyzeActivity)
 *
 * Conditionally exposed:
 *   - The module's `apply*` tool, if surface ends with `:create` or
 *     `:edit` AND that module is registered in `APPLY_TOOL_BY_MODULE`.
 *
 * **Why the apply tool is gated by surface, not by module name alone:**
 * preventing a frontend on `/banner` from sending `surface=check-in:create`
 * and getting the model to call applyCheckInConfig. The module-name
 * extraction here is the canonical authoritative dispatch.
 */

import type { ToolSet } from "ai";

import type { AdminSurface } from "../types";
import { moduleOf } from "../types";
import { APPLY_TOOL_BY_MODULE, type ApplyableModule } from "./apply-registry";
import { DOC_TOOL_NAMES, readDoc, searchDocs } from "./docs";
import { PATCH_TOOL_BY_MODULE, type PatchableModule } from "./patch-registry";
import { createQueryTools, QUERY_TOOL_NAMES } from "./queries";
import type { ChatExecutionContext } from "../types";
import { askClarification, navigateTo } from "./shared";

export function buildToolsForSurface(
  surface: AdminSurface,
  execCtx: ChatExecutionContext,
  /**
   * Extra apply-tool module ids to enable on top of the surface default.
   * Source: the set of `descriptor.toolModuleId` from any @-mentioned
   * resources in the current request. Allows the model to act on a
   * mentioned resource even when the user is on a different surface
   * (e.g. user is on the dashboard but @-mentions a check-in config).
   *
   * Modules without a registered apply tool are silently ignored — the
   * mention is then read-only.
   */
  extraToolModules: readonly string[] = [],
) {
  const queries = createQueryTools(execCtx);

  // Base set: always present for every surface. Query tools let the
  // agent answer "find / list / describe" questions even on a form
  // page (useful for "is there already a config like X?" before
  // proposing). Docs tools let the agent answer field-meaning /
  // how-to / best-practice questions on any surface.
  const tools: ToolSet = {
    askClarification,
    navigateTo,
    searchDocs,
    readDoc,
    ...queries,
  };

  // Apply tool only on `:create` / `:edit` surfaces of registered modules.
  const moduleName = moduleOf(surface);
  const isFormSurface =
    surface.endsWith(":create") || surface.endsWith(":edit");
  if (
    isFormSurface &&
    moduleName &&
    moduleName in APPLY_TOOL_BY_MODULE
  ) {
    const entry = APPLY_TOOL_BY_MODULE[moduleName as ApplyableModule];
    tools[entry.name] = entry.tool;
  }

  // Mention-driven extras. We add BOTH the apply and patch tools for
  // every mentioned module: apply for "the user wants to recreate this
  // shape elsewhere", patch for "the user wants to tweak the existing
  // resource". The system prompt guides the model to pick the right one
  // (patch for modifications, apply for new). Same `name → tool` overlay;
  // duplicate module ids are idempotent because the same tool object is
  // reassigned.
  for (const m of extraToolModules) {
    if (m in APPLY_TOOL_BY_MODULE) {
      const entry = APPLY_TOOL_BY_MODULE[m as ApplyableModule];
      tools[entry.name] = entry.tool;
    }
    if (m in PATCH_TOOL_BY_MODULE) {
      const entry = PATCH_TOOL_BY_MODULE[m as PatchableModule];
      tools[entry.name] = entry.tool;
    }
  }

  return tools;
}

export const ADMIN_AGENT_TOOL_NAMES = [
  "askClarification",
  "navigateTo",
  ...DOC_TOOL_NAMES,
  ...QUERY_TOOL_NAMES,
  ...Object.values(APPLY_TOOL_BY_MODULE).map((e) => e.name),
  ...Object.values(PATCH_TOOL_BY_MODULE).map((e) => e.name),
] as const;
