/**
 * Per-module helpers that translate an `apply*Config` tool's input into
 * a series of `form.setFieldValue(...)` calls on the corresponding
 * TanStack Form instance.
 *
 * Why per-module: each module's form-state shape is different from its
 * server-side `Create*Input` shape (the form holds non-optional values
 * with default empty strings; the server contract has many optionals).
 * We adapt at this seam rather than forcing the agent to know about
 * the form-state shape.
 */

import type { CreateAnnouncementInput } from "#/lib/types/announcement"
import type { CreateAssistPoolConfigInput } from "#/lib/types/assist-pool"
import type { CreateBadgeNodeInput } from "#/lib/types/badge"
import type { CreateBannerGroupInput } from "#/lib/types/banner"
import type { CreateBatchInput } from "#/lib/types/cdkey"
import type { CreateCharacterInput } from "#/lib/types/character"
import type { CreateConfigInput } from "#/lib/types/check-in"
import type { CreateCurrencyInput } from "#/lib/types/currency"
import type { CreateLeaderboardInput } from "#/lib/types/leaderboard"
import type { CreatePoolInput } from "#/lib/types/lottery"
import type { CreateMailInput } from "#/lib/types/mail"
import type { CreateRankSeasonInput } from "#/lib/types/rank"
import type { CreateShopProductInput } from "#/lib/types/shop"
import type { CreateMatchSquadConfigInput } from "#/lib/types/match-squad"

import type { AnnouncementFormApi } from "../announcement/use-announcement-form"
import type { AssistPoolFormApi } from "../assist-pool/use-config-form"
import type { BadgeNodeFormApi } from "../badge/use-node-form"
import type { GroupFormApi as BannerGroupFormApi } from "../banner/use-group-form"
import type { BatchFormApi } from "../cdkey/use-batch-form"
import type { CharacterFormApi } from "../character/use-character-form"
import type { CheckInFormApi } from "../check-in/use-config-form"
import type { DefinitionFormApi as CurrencyFormApi } from "../currency/use-definition-form"
import type { LeaderboardFormApi } from "../leaderboard/use-config-form"
import type { LotteryPoolFormApi } from "../lottery/use-pool-form"
import type { MessageFormApi } from "../mail/use-message-form"
import type { SeasonFormApi as RankSeasonFormApi } from "../rank/use-season-form"
import type { ProductFormApi as ShopProductFormApi } from "../shop/use-product-form"
import type { MatchSquadConfigFormApi } from "../match-squad/use-config-form"

/**
 * Apply an `applyCheckInConfig` tool input to the live check-in create
 * form. Fields the agent didn't supply are left as-is so the user's
 * existing input isn't clobbered.
 */
export function applyCheckInToForm(
  form: CheckInFormApi,
  input: CreateConfigInput,
) {
  if (input.name !== undefined) form.setFieldValue("name", input.name)
  if (input.alias !== undefined && input.alias !== null) {
    form.setFieldValue("alias", input.alias)
  }
  if (input.description !== undefined && input.description !== null) {
    form.setFieldValue("description", input.description)
  }
  if (input.resetMode !== undefined) {
    form.setFieldValue("resetMode", input.resetMode)
  }
  if (input.weekStartsOn !== undefined) {
    form.setFieldValue("weekStartsOn", input.weekStartsOn)
  }
  if (input.target !== undefined) form.setFieldValue("target", input.target)
  if (input.timezone !== undefined) form.setFieldValue("timezone", input.timezone)
  if (input.isActive !== undefined) form.setFieldValue("isActive", input.isActive)
  if (input.activityId !== undefined) {
    form.setFieldValue("activityId", input.activityId)
  }
}

/**
 * Apply an `applyAnnouncementConfig` tool input to the announcement
 * create/edit form. The form's local-input datetime fields use a
 * different shape than the server's ISO strings, so we convert.
 */
export function applyAnnouncementToForm(
  form: AnnouncementFormApi,
  input: CreateAnnouncementInput,
) {
  if (input.alias !== undefined) form.setFieldValue("alias", input.alias)
  if (input.kind !== undefined) form.setFieldValue("kind", input.kind)
  if (input.title !== undefined) form.setFieldValue("title", input.title)
  if (input.body !== undefined) form.setFieldValue("body", input.body)
  if (input.coverImageUrl !== undefined) {
    form.setFieldValue("coverImageUrl", input.coverImageUrl ?? "")
  }
  if (input.ctaUrl !== undefined) {
    form.setFieldValue("ctaUrl", input.ctaUrl ?? "")
  }
  if (input.ctaLabel !== undefined) {
    form.setFieldValue("ctaLabel", input.ctaLabel ?? "")
  }
  if (input.priority !== undefined) form.setFieldValue("priority", input.priority)
  if (input.severity !== undefined) form.setFieldValue("severity", input.severity)
  if (input.isActive !== undefined) form.setFieldValue("isActive", input.isActive)
  if (input.visibleFrom !== undefined) {
    form.setFieldValue("visibleFrom", isoToLocalInput(input.visibleFrom))
  }
  if (input.visibleUntil !== undefined) {
    form.setFieldValue("visibleUntil", isoToLocalInput(input.visibleUntil))
  }
}

/**
 * Apply an `applyCharacterConfig` tool input to the character form.
 */
export function applyCharacterToForm(
  form: CharacterFormApi,
  input: CreateCharacterInput,
) {
  if (input.name !== undefined) form.setFieldValue("name", input.name)
  if (input.alias !== undefined) {
    form.setFieldValue("alias", input.alias ?? "")
  }
  if (input.description !== undefined) {
    form.setFieldValue("description", input.description ?? "")
  }
  if (input.avatarUrl !== undefined) {
    form.setFieldValue("avatarUrl", input.avatarUrl ?? "")
  }
  if (input.portraitUrl !== undefined) {
    form.setFieldValue("portraitUrl", input.portraitUrl ?? "")
  }
  if (input.defaultSide !== undefined) {
    form.setFieldValue("defaultSide", input.defaultSide ?? null)
  }
  if (input.isActive !== undefined) form.setFieldValue("isActive", input.isActive)
}

/**
 * Apply an `applyMailConfig` tool input to the mail message form.
 *
 * Mapping notes:
 *   - server `content` → form `content`
 *   - server `targetUserIds[]` → form `recipientsRaw` (newline-joined)
 *   - server `expiresAt` (ISO) → form `expiresAt` (datetime-local string)
 *   - server `rewards` → form `entries`
 */
export function applyMailToForm(
  form: MessageFormApi,
  input: CreateMailInput,
) {
  if (input.title !== undefined) form.setFieldValue("title", input.title)
  if (input.content !== undefined) form.setFieldValue("content", input.content)
  if (input.targetType !== undefined) {
    form.setFieldValue("targetType", input.targetType)
  }
  if (input.targetUserIds) {
    form.setFieldValue("recipientsRaw", input.targetUserIds.join("\n"))
  }
  if (input.requireRead !== undefined) {
    form.setFieldValue("requireRead", input.requireRead)
  }
  if (input.expiresAt !== undefined) {
    form.setFieldValue("expiresAt", isoToLocalInput(input.expiresAt))
  }
  if (input.rewards !== undefined) {
    form.setFieldValue("entries", input.rewards)
  }
}

/**
 * Apply an `applyLeaderboardConfig` tool input to the leaderboard form.
 * The form stores `rewardTiers` as a JSON string for editor UX, so we
 * stringify here.
 */
export function applyLeaderboardToForm(
  form: LeaderboardFormApi,
  input: CreateLeaderboardInput,
) {
  if (input.alias !== undefined) form.setFieldValue("alias", input.alias)
  if (input.name !== undefined) form.setFieldValue("name", input.name)
  if (input.description !== undefined) {
    form.setFieldValue("description", input.description ?? "")
  }
  if (input.metricKey !== undefined) {
    form.setFieldValue("metricKey", input.metricKey)
  }
  if (input.cycle !== undefined) form.setFieldValue("cycle", input.cycle)
  if (input.weekStartsOn !== undefined) {
    form.setFieldValue("weekStartsOn", input.weekStartsOn)
  }
  if (input.timezone !== undefined) form.setFieldValue("timezone", input.timezone)
  if (input.scope !== undefined) form.setFieldValue("scope", input.scope)
  if (input.aggregation !== undefined) {
    form.setFieldValue("aggregation", input.aggregation)
  }
  if (input.maxEntries !== undefined) {
    form.setFieldValue("maxEntries", input.maxEntries)
  }
  if (input.tieBreaker !== undefined) {
    form.setFieldValue("tieBreaker", input.tieBreaker)
  }
  if (input.status !== undefined) form.setFieldValue("status", input.status)
  if (input.activityId !== undefined) {
    form.setFieldValue("activityId", input.activityId)
  }
  // rewardTiers are no longer edited in this form — they live in a
  // dedicated "Rewards" tab on the detail page (LeaderboardRewardsBlock).
  // The admin-agent assist tool intentionally cannot patch them here.
}

/**
 * Apply an `applyAssistPoolConfig` tool input to the assist-pool form.
 * The form flattens `contributionPolicy` into discrete fields per kind,
 * so we discriminate and write the right slice.
 */
export function applyAssistPoolToForm(
  form: AssistPoolFormApi,
  input: CreateAssistPoolConfigInput,
) {
  if (input.name !== undefined) form.setFieldValue("name", input.name)
  if (input.alias !== undefined) {
    form.setFieldValue("alias", input.alias ?? "")
  }
  if (input.description !== undefined) {
    form.setFieldValue("description", input.description ?? "")
  }
  if (input.mode !== undefined) form.setFieldValue("mode", input.mode)
  if (input.targetAmount !== undefined) {
    form.setFieldValue("targetAmount", input.targetAmount)
  }
  if (input.contributionPolicy !== undefined) {
    const p = input.contributionPolicy
    form.setFieldValue("policyKind", p.kind)
    if (p.kind === "fixed") form.setFieldValue("fixedAmount", p.amount)
    if (p.kind === "uniform") {
      form.setFieldValue("uniformMin", p.min)
      form.setFieldValue("uniformMax", p.max)
    }
    if (p.kind === "decaying") {
      form.setFieldValue("decayBase", p.base)
      form.setFieldValue("decayTailRatio", p.tailRatio)
      form.setFieldValue("decayTailFloor", p.tailFloor)
    }
  }
  if (input.perAssisterLimit !== undefined) {
    form.setFieldValue("perAssisterLimit", input.perAssisterLimit)
  }
  if (input.initiatorCanAssist !== undefined) {
    form.setFieldValue("initiatorCanAssist", input.initiatorCanAssist)
  }
  if (input.expiresInSeconds !== undefined) {
    form.setFieldValue("expiresInSeconds", input.expiresInSeconds)
  }
  if (input.isActive !== undefined) form.setFieldValue("isActive", input.isActive)
  // activityId is held externally by the caller (NodeCreatorDialog) — not on form.
}

/**
 * Apply an `applyCdkeyBatch` tool input to the cdkey batch form.
 * The form's `totalLimit` is a string for the input element; convert.
 */
export function applyCdkeyBatchToForm(
  form: BatchFormApi,
  input: CreateBatchInput,
) {
  if (input.name !== undefined) form.setFieldValue("name", input.name)
  if (input.alias !== undefined) {
    form.setFieldValue("alias", input.alias ?? "")
  }
  if (input.description !== undefined) {
    form.setFieldValue("description", input.description ?? "")
  }
  if (input.codeType !== undefined) {
    form.setFieldValue("codeType", input.codeType)
  }
  if (input.universalCode !== undefined) {
    form.setFieldValue("universalCode", input.universalCode ?? "")
  }
  if (input.initialCount !== undefined) {
    form.setFieldValue("initialCount", input.initialCount)
  }
  if (input.totalLimit !== undefined) {
    form.setFieldValue(
      "totalLimit",
      input.totalLimit !== null && input.totalLimit !== undefined
        ? String(input.totalLimit)
        : "",
    )
  }
  if (input.perUserLimit !== undefined) {
    form.setFieldValue("perUserLimit", input.perUserLimit)
  }
  if (input.startsAt !== undefined) {
    form.setFieldValue("startsAt", isoToLocalInput(input.startsAt))
  }
  if (input.endsAt !== undefined) {
    form.setFieldValue("endsAt", isoToLocalInput(input.endsAt))
  }
  if (input.isActive !== undefined) form.setFieldValue("isActive", input.isActive)
  if (input.reward !== undefined) form.setFieldValue("reward", input.reward)
}

/** Apply an `applyCurrencyDefinition` tool input to the currency form. */
export function applyCurrencyDefinitionToForm(
  form: CurrencyFormApi,
  input: CreateCurrencyInput,
) {
  if (input.name !== undefined) form.setFieldValue("name", input.name)
  if (input.alias !== undefined) form.setFieldValue("alias", input.alias ?? "")
  if (input.description !== undefined) {
    form.setFieldValue("description", input.description ?? "")
  }
  if (input.icon !== undefined) form.setFieldValue("icon", input.icon ?? "")
  if (input.isActive !== undefined) form.setFieldValue("isActive", input.isActive)
  if (input.activityId !== undefined) {
    form.setFieldValue("activityId", input.activityId)
  }
}

/** Apply an `applyLotteryConfig` tool input to the lottery pool form. */
export function applyLotteryToForm(
  form: LotteryPoolFormApi,
  input: CreatePoolInput,
) {
  if (input.name !== undefined) form.setFieldValue("name", input.name)
  if (input.alias !== undefined) form.setFieldValue("alias", input.alias ?? "")
  if (input.description !== undefined) {
    form.setFieldValue("description", input.description ?? "")
  }
  if (input.isActive !== undefined) form.setFieldValue("isActive", input.isActive)
  if (input.globalPullLimit !== undefined) {
    form.setFieldValue("globalPullLimit", input.globalPullLimit)
  }
  if (input.activityId !== undefined) {
    form.setFieldValue("activityId", input.activityId)
  }
}

/** Apply an `applyMatchSquadConfig` tool input to the team config form. */
export function applyMatchSquadToForm(
  form: MatchSquadConfigFormApi,
  input: CreateMatchSquadConfigInput,
) {
  if (input.name !== undefined) form.setFieldValue("name", input.name)
  if (input.alias !== undefined) form.setFieldValue("alias", input.alias ?? "")
  if (input.maxMembers !== undefined) {
    form.setFieldValue("maxMembers", input.maxMembers)
  }
  if (input.autoDissolveOnLeaderLeave !== undefined) {
    form.setFieldValue(
      "autoDissolveOnLeaderLeave",
      input.autoDissolveOnLeaderLeave,
    )
  }
  if (input.allowQuickMatch !== undefined) {
    form.setFieldValue("allowQuickMatch", input.allowQuickMatch)
  }
}

/** Apply an `applyBannerConfig` (banner group) tool input to the form. */
export function applyBannerToForm(
  form: BannerGroupFormApi,
  input: CreateBannerGroupInput,
) {
  if (input.alias !== undefined) form.setFieldValue("alias", input.alias ?? "")
  if (input.name !== undefined) form.setFieldValue("name", input.name)
  if (input.description !== undefined) {
    form.setFieldValue("description", input.description ?? "")
  }
  if (input.layout !== undefined) form.setFieldValue("layout", input.layout)
  if (input.intervalMs !== undefined) {
    form.setFieldValue("intervalMs", input.intervalMs)
  }
  if (input.isActive !== undefined) form.setFieldValue("isActive", input.isActive)
  // activityId is held externally, not on form.
}

/** Apply an `applyRankConfig` (season-level) tool input to the form. */
export function applyRankToForm(
  form: RankSeasonFormApi,
  input: CreateRankSeasonInput,
) {
  if (input.alias !== undefined) form.setFieldValue("alias", input.alias)
  if (input.name !== undefined) form.setFieldValue("name", input.name)
  if (input.description !== undefined) {
    form.setFieldValue("description", input.description ?? "")
  }
  if (input.tierConfigId !== undefined) {
    form.setFieldValue("tierConfigId", input.tierConfigId)
  }
  if (input.startAt !== undefined) {
    form.setFieldValue("startAt", isoToLocalInput(input.startAt))
  }
  if (input.endAt !== undefined) {
    form.setFieldValue("endAt", isoToLocalInput(input.endAt))
  }
}

/**
 * Apply an `applyBadgeNodeConfig` tool input to the badge node form.
 * The form stores `dismissConfig` / `visibilityRule` as JSON-string
 * textareas, so we stringify the structured input.
 */
export function applyBadgeNodeToForm(
  form: BadgeNodeFormApi,
  input: CreateBadgeNodeInput,
) {
  if (input.key !== undefined) form.setFieldValue("key", input.key)
  if (input.parentKey !== undefined) {
    form.setFieldValue("parentKey", input.parentKey)
  }
  if (input.displayType !== undefined) {
    form.setFieldValue("displayType", input.displayType)
  }
  if (input.displayLabelKey !== undefined) {
    form.setFieldValue("displayLabelKey", input.displayLabelKey ?? "")
  }
  if (input.signalMatchMode !== undefined) {
    form.setFieldValue("signalMatchMode", input.signalMatchMode)
  }
  if (input.signalKey !== undefined) {
    form.setFieldValue("signalKey", input.signalKey ?? "")
  }
  if (input.signalKeyPrefix !== undefined) {
    form.setFieldValue("signalKeyPrefix", input.signalKeyPrefix ?? "")
  }
  if (input.aggregation !== undefined) {
    form.setFieldValue("aggregation", input.aggregation)
  }
  if (input.dismissMode !== undefined) {
    form.setFieldValue("dismissMode", input.dismissMode)
  }
  if (input.dismissConfig !== undefined) {
    form.setFieldValue(
      "dismissConfigJson",
      input.dismissConfig
        ? JSON.stringify(input.dismissConfig, null, 2)
        : "",
    )
  }
  if (input.visibilityRule !== undefined) {
    form.setFieldValue(
      "visibilityRuleJson",
      input.visibilityRule
        ? JSON.stringify(input.visibilityRule, null, 2)
        : "",
    )
  }
  if (input.isActive !== undefined) {
    form.setFieldValue("isActive", input.isActive)
  }
}

/**
 * Apply an `applyShopProductConfig` tool input to the shop product form.
 *
 * Mapping notes:
 *   - `categoryId: null` ↔ form's "__none__" sentinel
 *   - server `availableFrom/To` ISO ↔ form's datetime-local string
 *   - server numeric limits (null/N) ↔ form's `"" | number` union
 */
export function applyShopProductToForm(
  form: ShopProductFormApi,
  input: CreateShopProductInput,
) {
  if (input.name !== undefined) form.setFieldValue("name", input.name)
  if (input.alias !== undefined) form.setFieldValue("alias", input.alias ?? "")
  if (input.categoryId !== undefined) {
    form.setFieldValue("categoryId", input.categoryId ?? "__none__")
  }
  if (input.description !== undefined) {
    form.setFieldValue("description", input.description ?? "")
  }
  if (input.coverImage !== undefined) {
    form.setFieldValue("coverImage", input.coverImage ?? "")
  }
  if (input.galleryImages !== undefined) {
    form.setFieldValue("galleryImages", input.galleryImages ?? [])
  }
  if (input.productType !== undefined) {
    form.setFieldValue("productType", input.productType)
  }
  if (input.costItems !== undefined) {
    form.setFieldValue("costItems", input.costItems)
  }
  if (input.rewardItems !== undefined) {
    form.setFieldValue("rewardItems", input.rewardItems)
  }
  if (input.timeWindowType !== undefined) {
    form.setFieldValue("timeWindowType", input.timeWindowType)
  }
  if (input.availableFrom !== undefined) {
    form.setFieldValue("availableFrom", isoToLocalInput(input.availableFrom))
  }
  if (input.availableTo !== undefined) {
    form.setFieldValue("availableTo", isoToLocalInput(input.availableTo))
  }
  if (input.eligibilityAnchor !== undefined && input.eligibilityAnchor !== null) {
    form.setFieldValue("eligibilityAnchor", input.eligibilityAnchor)
  }
  if (input.eligibilityWindowSeconds !== undefined) {
    form.setFieldValue(
      "eligibilityWindowSeconds",
      input.eligibilityWindowSeconds ?? "",
    )
  }
  if (input.refreshCycle !== undefined && input.refreshCycle !== null) {
    form.setFieldValue("refreshCycle", input.refreshCycle)
  }
  if (input.refreshLimit !== undefined) {
    form.setFieldValue("refreshLimit", input.refreshLimit ?? "")
  }
  if (input.userLimit !== undefined) {
    form.setFieldValue("userLimit", input.userLimit ?? "")
  }
  if (input.globalLimit !== undefined) {
    form.setFieldValue("globalLimit", input.globalLimit ?? "")
  }
  if (input.isActive !== undefined) {
    form.setFieldValue("isActive", input.isActive)
  }
  if (input.tagIds !== undefined) {
    form.setFieldValue("tagIds", input.tagIds ?? [])
  }
}

function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  )
}
