/**
 * Module registry — single source of truth for "which apply* tool name
 * the model emits for each module" and "how to write that tool's input
 * back into the form".
 *
 * Adding a new module = one entry here + one helper in apply-helpers.ts +
 * one tool in `apps/server/src/modules/admin-agent/tools/<module>.ts`.
 *
 * Surface lookup: `getModuleEntry(surface)` strips the `:create`/`:edit`
 * suffix. Keep the keys in sync with the module names used in
 * `apps/server/src/modules/admin-agent/types.ts` (the AdminSurface
 * enum's first segment).
 */

import type { AdminSurface } from "#/lib/admin-surface"

import type { AnyFormApi } from "./FormProvider"
import {
  applyAnnouncementToForm,
  applyAssistPoolToForm,
  applyBadgeNodeToForm,
  applyBannerToForm,
  applyCdkeyBatchToForm,
  applyCharacterToForm,
  applyCheckInToForm,
  applyCurrencyDefinitionToForm,
  applyLeaderboardToForm,
  applyLotteryToForm,
  applyMailToForm,
  applyRankToForm,
  applyShopProductToForm,
  applyTeamToForm,
} from "./apply-helpers"

export type ModuleEntry = {
  /** Tool name the model emits — must match `tool-${name}` UIMessage parts. */
  applyToolName: string
  /** Type-erased apply helper. The helper itself does the typed cast. */
  applyToForm: (form: AnyFormApi, input: unknown) => void
}

/**
 * Build a `ModuleEntry` with type-erased adapters around a module's
 * apply helper. Saves 5 lines of casting boilerplate per entry.
 */
function adapt<F, I>(
  applyToolName: string,
  fn: (form: F, input: I) => void,
): ModuleEntry {
  return {
    applyToolName,
    applyToForm: (form, input) => fn(form as F, input as I),
  }
}

export const MODULE_REGISTRY: Record<string, ModuleEntry> = {
  "check-in": adapt("applyCheckInConfig", applyCheckInToForm),
  "announcement": adapt("applyAnnouncementConfig", applyAnnouncementToForm),
  "assist-pool": adapt("applyAssistPoolConfig", applyAssistPoolToForm),
  "badge": adapt("applyBadgeNodeConfig", applyBadgeNodeToForm),
  "banner": adapt("applyBannerConfig", applyBannerToForm),
  "cdkey": adapt("applyCdkeyBatch", applyCdkeyBatchToForm),
  "character": adapt("applyCharacterConfig", applyCharacterToForm),
  "currency": adapt("applyCurrencyDefinition", applyCurrencyDefinitionToForm),
  "leaderboard": adapt("applyLeaderboardConfig", applyLeaderboardToForm),
  "lottery": adapt("applyLotteryConfig", applyLotteryToForm),
  "mail": adapt("applyMailConfig", applyMailToForm),
  "rank": adapt("applyRankConfig", applyRankToForm),
  "shop": adapt("applyShopProductConfig", applyShopProductToForm),
  "team": adapt("applyTeamConfig", applyTeamToForm),
}

/**
 * Resolve the module entry for a given surface.
 *
 * Returns `undefined` for surfaces where there's no form to write into:
 *   - `dashboard` (no module context at all)
 *   - `<module>:list` (we're on a listing page; AI is in query mode)
 *
 * Only `:create` / `:edit` (and any future `:<form-bearing>` surface)
 * resolve to a module entry. This is how the AIAssistPanel decides
 * whether to offer "回填表单" UX or "查询模式" UX.
 */
export function getModuleEntry(surface: AdminSurface): ModuleEntry | undefined {
  if (surface === "dashboard") return undefined
  const [moduleName, intent] = surface.split(":")
  if (intent !== "create" && intent !== "edit") return undefined
  return MODULE_REGISTRY[moduleName]
}
