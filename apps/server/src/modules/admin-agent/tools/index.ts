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

import type { AdminSurface } from "../types";
import { moduleOf } from "../types";
import { APPLY_TOOL_BY_MODULE, type ApplyableModule } from "./apply-registry";
import { DOC_TOOL_NAMES, readDoc, searchDocs } from "./docs";
import { createQueryTools, QUERY_TOOL_NAMES } from "./queries";
import type { ChatExecutionContext } from "../types";
import { askClarification, navigateTo } from "./shared";

export function buildToolsForSurface(
  surface: AdminSurface,
  execCtx: ChatExecutionContext,
) {
  const queries = createQueryTools(execCtx);

  // Base set: always present for every surface. Query tools let the
  // agent answer "find / list / describe" questions even on a form
  // page (useful for "is there already a config like X?" before
  // proposing). Docs tools let the agent answer field-meaning /
  // how-to / best-practice questions on any surface.
  const baseTools = {
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
    return {
      ...baseTools,
      [entry.name]: entry.tool,
    };
  }

  return baseTools;
}

export const ADMIN_AGENT_TOOL_NAMES = [
  "askClarification",
  "navigateTo",
  ...DOC_TOOL_NAMES,
  ...QUERY_TOOL_NAMES,
  ...Object.values(APPLY_TOOL_BY_MODULE).map((e) => e.name),
] as const;
