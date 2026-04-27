import { useForm } from "@tanstack/react-form"

import * as m from "#/paraglide/messages.js"
import type { RewardEntry } from "#/lib/types/rewards"
import type {
  CreateShopProductInput,
  ShopEligibilityAnchor,
  ShopProductType,
  ShopRefreshCycle,
  ShopTimeWindowType,
} from "#/lib/types/shop"

export type ShopProductFormValues = {
  name: string
  alias: string
  categoryId: string
  description: string
  coverImage: string
  galleryImages: string[]
  productType: ShopProductType
  costItems: RewardEntry[]
  rewardItems: RewardEntry[]
  timeWindowType: ShopTimeWindowType
  availableFrom: string
  availableTo: string
  eligibilityAnchor: ShopEligibilityAnchor
  eligibilityWindowSeconds: number | ""
  refreshCycle: ShopRefreshCycle
  refreshLimit: number | ""
  userLimit: number | ""
  globalLimit: number | ""
  sortOrder: number
  isActive: boolean
  tagIds: string[]
  formError: string
}

const NO_CATEGORY = "__none__"

function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  )
}

function fromLocalInputValue(s: string): string | null {
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function useProductForm({
  defaultValues,
  onSubmit,
}: {
  defaultValues?: Partial<CreateShopProductInput> & { tagIds?: string[] }
  onSubmit: (input: CreateShopProductInput) => void | Promise<void>
}) {
  // activityId is held externally — not part of the form, but we
  // remember it so the submit can pass it through unchanged.
  const activityId = defaultValues?.activityId ?? null

  return useForm({
    defaultValues: {
      name: defaultValues?.name ?? "",
      alias: defaultValues?.alias ?? "",
      categoryId: defaultValues?.categoryId ?? NO_CATEGORY,
      description: defaultValues?.description ?? "",
      coverImage: defaultValues?.coverImage ?? "",
      galleryImages: defaultValues?.galleryImages ?? [],
      productType: (defaultValues?.productType ?? "regular") as ShopProductType,
      costItems: defaultValues?.costItems ?? [],
      rewardItems: defaultValues?.rewardItems ?? [],
      timeWindowType: (defaultValues?.timeWindowType ?? "none") as ShopTimeWindowType,
      availableFrom: toLocalInputValue(defaultValues?.availableFrom),
      availableTo: toLocalInputValue(defaultValues?.availableTo),
      eligibilityAnchor: (defaultValues?.eligibilityAnchor ??
        "user_created") as ShopEligibilityAnchor,
      eligibilityWindowSeconds: defaultValues?.eligibilityWindowSeconds ?? "",
      refreshCycle: (defaultValues?.refreshCycle ?? "daily") as ShopRefreshCycle,
      refreshLimit: defaultValues?.refreshLimit ?? "",
      userLimit: defaultValues?.userLimit ?? "",
      globalLimit: defaultValues?.globalLimit ?? "",
      sortOrder: defaultValues?.sortOrder ?? 0,
      isActive: defaultValues?.isActive ?? true,
      tagIds: defaultValues?.tagIds ?? [],
      formError: "",
    } as ShopProductFormValues,
    onSubmit: async ({ value, formApi }) => {
      formApi.setFieldValue("formError", "")
      if (!value.name.trim()) {
        formApi.setFieldValue("formError", `${m.common_name()} *`)
        return
      }
      const validCosts = value.costItems.filter((e) => e.id && e.count > 0)
      const validRewards = value.rewardItems.filter((e) => e.id && e.count > 0)
      const input: CreateShopProductInput = {
        name: value.name.trim(),
        alias: value.alias || null,
        categoryId: value.categoryId === NO_CATEGORY ? null : value.categoryId,
        description: value.description || null,
        coverImage: value.coverImage || null,
        galleryImages: value.galleryImages.length > 0 ? value.galleryImages : null,
        productType: value.productType,
        costItems: validCosts,
        rewardItems: validRewards,
        timeWindowType: value.timeWindowType,
        availableFrom:
          value.timeWindowType === "absolute"
            ? fromLocalInputValue(value.availableFrom)
            : null,
        availableTo:
          value.timeWindowType === "absolute"
            ? fromLocalInputValue(value.availableTo)
            : null,
        eligibilityAnchor:
          value.timeWindowType === "relative" ? value.eligibilityAnchor : null,
        eligibilityWindowSeconds:
          value.timeWindowType === "relative" && value.eligibilityWindowSeconds !== ""
            ? Number(value.eligibilityWindowSeconds)
            : null,
        refreshCycle: value.timeWindowType === "cyclic" ? value.refreshCycle : null,
        refreshLimit:
          value.timeWindowType === "cyclic" && value.refreshLimit !== ""
            ? Number(value.refreshLimit)
            : null,
        userLimit: value.userLimit === "" ? null : Number(value.userLimit),
        globalLimit: value.globalLimit === "" ? null : Number(value.globalLimit),
        sortOrder: value.sortOrder,
        isActive: value.isActive,
        activityId,
        tagIds: value.tagIds,
      }
      await onSubmit(input)
    },
  })
}

export type ProductFormApi = ReturnType<typeof useProductForm>
