/**
 * Compose the tool set exposed to the model. Two layers:
 *
 *   - `buildBaseTools()` — always-on: askClarification, navigateTo,
 *     searchDocs, readDoc, plus query tools (queryModule / describeConfig
 *     / analyzeActivity). These are agent-agnostic; both form-fill and
 *     global-assistant want to answer "find / list / describe" questions.
 *
 *   - `buildPatchTools(modules, variant)` — module-scoped patch tools,
 *     `propose` (form-fill, no `execute`) or `execute` (global-assistant,
 *     writes via service). Module set comes from @-mention resolution.
 *
 *   - `buildApplyTool(surface)` — surface-scoped apply tool for the
 *     module's create/edit form. Apply is currently propose-only (the
 *     "create new resource" path is too easy to misuse via the assistant
 *     chat — first-class create flow stays in the form drawer).
 *
 * **Why the apply tool is gated by surface, not by module name alone:**
 * preventing a frontend on `/banner` from sending `surface=check-in:create`
 * and getting the model to call applyCheckInConfig. The module-name
 * extraction here is the canonical authoritative dispatch.
 */

import type { ToolSet } from "ai";

import type { ChatExecutionContext } from "../types";
import {
  APPLY_TOOL_BY_MODULE,
  type ApplyableModule,
} from "./apply-registry";
import { DOC_TOOL_NAMES, readDoc, searchDocs } from "./docs";
import {
  PATCH_TOOL_BY_MODULE,
  type PatchableModule,
  type PatchToolVariant,
} from "./patch-registry";
import { createQueryTools, QUERY_TOOL_NAMES } from "./queries";
import type { AdminSurface } from "../types";
import { moduleOf } from "../types";
import { askClarification, navigateTo } from "./shared";

/**
 * Always-present tools. `execCtx` is only needed by query tools (they
 * read org-scoped DB rows directly via `execute` closures — these are
 * read-only and predate the agent split, so they keep the closure form;
 * patch tools moved to `experimental_context` for stateless module-level
 * singletons).
 */
export function buildBaseTools(execCtx: ChatExecutionContext): ToolSet {
  return {
    askClarification,
    navigateTo,
    searchDocs,
    readDoc,
    ...createQueryTools(execCtx),
  };
}

/**
 * Map a list of mention-supplied module ids to their patch tools. Modules
 * not in `PATCH_TOOL_BY_MODULE` are silently ignored — the mention is
 * read-only in that case. Variant decides propose-vs-execute.
 */
export function buildPatchTools(
  modules: readonly string[],
  variant: PatchToolVariant,
): ToolSet {
  const tools: ToolSet = {};
  for (const m of modules) {
    if (m in PATCH_TOOL_BY_MODULE) {
      const entry = PATCH_TOOL_BY_MODULE[m as PatchableModule];
      tools[entry.name] = entry[variant];
    }
  }
  return tools;
}

/**
 * Apply tool only on `:create` / `:edit` surfaces of registered modules.
 * Returns null on dashboard/list surfaces or modules without an apply
 * tool registered.
 */
export function buildApplyTool(surface: AdminSurface): ToolSet {
  const moduleName = moduleOf(surface);
  const isFormSurface =
    surface.endsWith(":create") || surface.endsWith(":edit");
  if (!isFormSurface || !moduleName || !(moduleName in APPLY_TOOL_BY_MODULE)) {
    return {};
  }
  const entry = APPLY_TOOL_BY_MODULE[moduleName as ApplyableModule];
  return { [entry.name]: entry.tool };
}

export const ADMIN_AGENT_TOOL_NAMES = [
  "askClarification",
  "navigateTo",
  ...DOC_TOOL_NAMES,
  ...QUERY_TOOL_NAMES,
  ...Object.values(APPLY_TOOL_BY_MODULE).map((e) => e.name),
  ...Object.values(PATCH_TOOL_BY_MODULE).map((e) => e.name),
] as const;
