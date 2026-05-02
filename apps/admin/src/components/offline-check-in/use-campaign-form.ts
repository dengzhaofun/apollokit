/**
 * Externalized form state for the offline-check-in campaign create/edit
 * drawer. Mirrors `check-in/use-config-form.ts` so the AI assist panel
 * can write field values directly into the same form instance the user
 * is editing.
 */

import { useForm } from "@tanstack/react-form"

import type { RewardEntry } from "#/lib/types/rewards"
import type {
  CreateCampaignInput,
  OfflineCheckInCompletionRule,
  OfflineCheckInMode,
} from "#/lib/types/offline-check-in"

export type CampaignFormValues = {
  name: string
  alias: string
  description: string
  bannerImage: string
  mode: OfflineCheckInMode
  completionRule: OfflineCheckInCompletionRule
  completionRewards: RewardEntry[]
  startAt: string
  endAt: string
  timezone: string
  collectionAlbumId: string
}

export function buildDefaultCampaignValues(
  defaults?: Partial<CreateCampaignInput>,
): CampaignFormValues {
  const mode = defaults?.mode ?? "collect"
  return {
    name: defaults?.name ?? "",
    alias: defaults?.alias ?? "",
    description: defaults?.description ?? "",
    bannerImage: defaults?.bannerImage ?? "",
    mode,
    completionRule:
      defaults?.completionRule ??
      (mode === "daily"
        ? { kind: "daily_total", days: 3 }
        : { kind: "all" }),
    completionRewards: defaults?.completionRewards ?? [],
    startAt: defaults?.startAt ?? "",
    endAt: defaults?.endAt ?? "",
    timezone:
      defaults?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    collectionAlbumId: defaults?.collectionAlbumId ?? "",
  }
}

/** Map internal form values onto the server's create input. */
export function toCreateCampaignInput(
  v: CampaignFormValues,
): CreateCampaignInput {
  return {
    name: v.name,
    alias: v.alias || null,
    description: v.description || null,
    bannerImage: v.bannerImage || null,
    mode: v.mode,
    completionRule: v.completionRule,
    completionRewards: v.completionRewards,
    startAt: v.startAt || null,
    endAt: v.endAt || null,
    timezone: v.timezone,
    collectionAlbumId: v.collectionAlbumId || null,
  }
}

export function useCampaignForm({
  defaultValues,
  onSubmit,
}: {
  defaultValues?: Partial<CreateCampaignInput>
  onSubmit: (values: CreateCampaignInput) => void | Promise<void>
}) {
  return useForm({
    defaultValues: buildDefaultCampaignValues(defaultValues),
    onSubmit: async ({ value }) => {
      await onSubmit(toCreateCampaignInput(value))
    },
  })
}

export type CampaignFormApi = ReturnType<typeof useCampaignForm>
