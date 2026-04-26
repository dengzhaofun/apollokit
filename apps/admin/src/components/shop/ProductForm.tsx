import { useState } from "react"

import { ImageListField } from "#/components/forms/ImageListField"
import { MediaPickerDialog } from "#/components/media-library/MediaPickerDialog"
import { RewardEntryEditor } from "#/components/rewards/RewardEntryEditor"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import { Switch } from "#/components/ui/switch"
import { Textarea } from "#/components/ui/textarea"
import { useAllShopTags, useShopCategories } from "#/hooks/use-shop"
import type { RewardEntry } from "#/lib/types/rewards"
import type {
  CreateShopProductInput,
  ShopEligibilityAnchor,
  ShopProductType,
  ShopRefreshCycle,
  ShopTimeWindowType,
} from "#/lib/types/shop"
import * as m from "#/paraglide/messages.js"
import { TagBadge } from "./TagBadge"

interface ProductFormProps {
  defaultValues?: Partial<CreateShopProductInput> & { tagIds?: string[] }
  onSubmit: (input: CreateShopProductInput) => void | Promise<void>
  isPending?: boolean
  submitLabel?: string
}

function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  // Render as YYYY-MM-DDTHH:mm in local timezone
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

export function ProductForm({
  defaultValues,
  onSubmit,
  isPending,
  submitLabel,
}: ProductFormProps) {
  const { data: categories } = useShopCategories()
  const { data: tags } = useAllShopTags()

  const [name, setName] = useState(defaultValues?.name ?? "")
  const [alias, setAlias] = useState(defaultValues?.alias ?? "")
  const [categoryId, setCategoryId] = useState<string>(
    defaultValues?.categoryId ?? "__none__",
  )
  const [description, setDescription] = useState(
    defaultValues?.description ?? "",
  )
  const [coverImage, setCoverImage] = useState(defaultValues?.coverImage ?? "")
  const [galleryImages, setGalleryImages] = useState<string[]>(
    defaultValues?.galleryImages ?? [],
  )
  const [productType, setProductType] = useState<ShopProductType>(
    defaultValues?.productType ?? "regular",
  )
  const [costItems, setCostItems] = useState<RewardEntry[]>(
    defaultValues?.costItems ?? [],
  )
  const [rewardItems, setRewardItems] = useState<RewardEntry[]>(
    defaultValues?.rewardItems ?? [],
  )

  const [timeWindowType, setTimeWindowType] = useState<ShopTimeWindowType>(
    defaultValues?.timeWindowType ?? "none",
  )
  const [availableFrom, setAvailableFrom] = useState(
    toLocalInputValue(defaultValues?.availableFrom),
  )
  const [availableTo, setAvailableTo] = useState(
    toLocalInputValue(defaultValues?.availableTo),
  )
  const [eligibilityAnchor, setEligibilityAnchor] =
    useState<ShopEligibilityAnchor>(
      defaultValues?.eligibilityAnchor ?? "user_created",
    )
  const [eligibilityWindowSeconds, setEligibilityWindowSeconds] = useState<
    number | ""
  >(defaultValues?.eligibilityWindowSeconds ?? "")
  const [refreshCycle, setRefreshCycle] = useState<ShopRefreshCycle>(
    defaultValues?.refreshCycle ?? "daily",
  )
  const [refreshLimit, setRefreshLimit] = useState<number | "">(
    defaultValues?.refreshLimit ?? "",
  )

  const [userLimit, setUserLimit] = useState<number | "">(
    defaultValues?.userLimit ?? "",
  )
  const [globalLimit, setGlobalLimit] = useState<number | "">(
    defaultValues?.globalLimit ?? "",
  )
  const [sortOrder, setSortOrder] = useState(defaultValues?.sortOrder ?? 0)
  const [isActive, setIsActive] = useState(defaultValues?.isActive ?? true)
  const activityId = defaultValues?.activityId ?? null
  const [tagIds, setTagIds] = useState<string[]>(defaultValues?.tagIds ?? [])

  const [error, setError] = useState<string>("")

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (!name.trim()) {
      setError(m.common_name() + " *")
      return
    }
    const validCosts = costItems.filter((e) => e.id && e.count > 0)
    const validRewards = rewardItems.filter((e) => e.id && e.count > 0)
    const input: CreateShopProductInput = {
      name: name.trim(),
      alias: alias || null,
      categoryId: categoryId === "__none__" ? null : categoryId,
      description: description || null,
      coverImage: coverImage || null,
      galleryImages: galleryImages.length > 0 ? galleryImages : null,
      productType,
      costItems: validCosts,
      rewardItems: validRewards,
      timeWindowType,
      availableFrom:
        timeWindowType === "absolute" ? fromLocalInputValue(availableFrom) : null,
      availableTo:
        timeWindowType === "absolute" ? fromLocalInputValue(availableTo) : null,
      eligibilityAnchor:
        timeWindowType === "relative" ? eligibilityAnchor : null,
      eligibilityWindowSeconds:
        timeWindowType === "relative" && eligibilityWindowSeconds !== ""
          ? Number(eligibilityWindowSeconds)
          : null,
      refreshCycle: timeWindowType === "cyclic" ? refreshCycle : null,
      refreshLimit:
        timeWindowType === "cyclic" && refreshLimit !== ""
          ? Number(refreshLimit)
          : null,
      userLimit: userLimit === "" ? null : Number(userLimit),
      globalLimit: globalLimit === "" ? null : Number(globalLimit),
      sortOrder,
      isActive,
      activityId,
      tagIds,
    }
    onSubmit(input)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase text-muted-foreground">
          {m.common_name()}
        </h2>
        <div className="space-y-2">
          <Label htmlFor="prod-name">{m.common_name()} *</Label>
          <Input
            id="prod-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="prod-alias">{m.common_alias()}</Label>
            <Input
              id="prod-alias"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="prod-cat">{m.shop_category()}</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="prod-cat" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{m.shop_no_category()}</SelectItem>
                {(categories ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="prod-desc">{m.common_description()}</Label>
          <Textarea
            id="prod-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>{m.shop_cover_image()}</Label>
            <MediaPickerDialog
              value={coverImage || null}
              onChange={setCoverImage}
            />
          </div>
          <div className="space-y-2">
            <Label>{m.shop_gallery_images()}</Label>
            <ImageListField value={galleryImages} onChange={setGalleryImages} />
            <p className="text-xs text-muted-foreground">
              {m.shop_gallery_hint()}
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase text-muted-foreground">
          {m.shop_product_type()}
        </h2>
        <Select
          value={productType}
          onValueChange={(v) => setProductType(v as ShopProductType)}
        >
          <SelectTrigger className="w-full sm:w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="regular">{m.shop_type_regular()}</SelectItem>
            <SelectItem value="growth_pack">
              {m.shop_type_growth_pack()}
            </SelectItem>
          </SelectContent>
        </Select>
        {productType === "growth_pack" ? (
          <p className="text-xs text-muted-foreground">
            {m.shop_reward_items_hint()}
          </p>
        ) : null}
      </section>

      <section className="space-y-6">
        <h2 className="text-sm font-semibold uppercase text-muted-foreground">
          {m.shop_cost_items()} / {m.shop_reward_items()}
        </h2>
        <RewardEntryEditor
          label={m.shop_cost_items()}
          entries={costItems}
          onChange={setCostItems}
        />
        <RewardEntryEditor
          label={m.shop_reward_items()}
          entries={rewardItems}
          onChange={setRewardItems}
          hint={
            productType === "growth_pack" ? m.shop_reward_items_hint() : undefined
          }
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase text-muted-foreground">
          {m.shop_time_window_type()}
        </h2>
        <Select
          value={timeWindowType}
          onValueChange={(v) => setTimeWindowType(v as ShopTimeWindowType)}
        >
          <SelectTrigger className="w-full sm:w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{m.shop_time_window_none()}</SelectItem>
            <SelectItem value="absolute">
              {m.shop_time_window_absolute()}
            </SelectItem>
            <SelectItem value="relative">
              {m.shop_time_window_relative()}
            </SelectItem>
            <SelectItem value="cyclic">
              {m.shop_time_window_cyclic()}
            </SelectItem>
          </SelectContent>
        </Select>

        {timeWindowType === "absolute" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="prod-from">{m.shop_available_from()}</Label>
              <Input
                id="prod-from"
                type="datetime-local"
                value={availableFrom}
                onChange={(e) => setAvailableFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prod-to">{m.shop_available_to()}</Label>
              <Input
                id="prod-to"
                type="datetime-local"
                value={availableTo}
                onChange={(e) => setAvailableTo(e.target.value)}
              />
            </div>
          </div>
        ) : null}

        {timeWindowType === "relative" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="prod-anchor">{m.shop_eligibility_anchor()}</Label>
              <Select
                value={eligibilityAnchor}
                onValueChange={(v) =>
                  setEligibilityAnchor(v as ShopEligibilityAnchor)
                }
              >
                <SelectTrigger id="prod-anchor" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user_created">
                    {m.shop_anchor_user_created()}
                  </SelectItem>
                  <SelectItem value="first_purchase">
                    {m.shop_anchor_first_purchase()}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="prod-window">
                {m.shop_eligibility_window_seconds()}
              </Label>
              <Input
                id="prod-window"
                type="number"
                min={1}
                value={eligibilityWindowSeconds}
                onChange={(e) =>
                  setEligibilityWindowSeconds(
                    e.target.value === "" ? "" : Number(e.target.value),
                  )
                }
              />
            </div>
          </div>
        ) : null}

        {timeWindowType === "cyclic" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="prod-cycle">{m.shop_refresh_cycle()}</Label>
              <Select
                value={refreshCycle}
                onValueChange={(v) => setRefreshCycle(v as ShopRefreshCycle)}
              >
                <SelectTrigger id="prod-cycle" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">{m.shop_cycle_daily()}</SelectItem>
                  <SelectItem value="weekly">
                    {m.shop_cycle_weekly()}
                  </SelectItem>
                  <SelectItem value="monthly">
                    {m.shop_cycle_monthly()}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="prod-rlimit">{m.shop_refresh_limit()}</Label>
              <Input
                id="prod-rlimit"
                type="number"
                min={1}
                value={refreshLimit}
                onChange={(e) =>
                  setRefreshLimit(
                    e.target.value === "" ? "" : Number(e.target.value),
                  )
                }
              />
            </div>
          </div>
        ) : null}
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase text-muted-foreground">
          {m.shop_user_limit()} / {m.shop_global_limit()}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="prod-ulimit">{m.shop_user_limit()}</Label>
            <Input
              id="prod-ulimit"
              type="number"
              min={1}
              value={userLimit}
              onChange={(e) =>
                setUserLimit(e.target.value === "" ? "" : Number(e.target.value))
              }
              placeholder={m.common_unlimited()}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="prod-glimit">{m.shop_global_limit()}</Label>
            <Input
              id="prod-glimit"
              type="number"
              min={1}
              value={globalLimit}
              onChange={(e) =>
                setGlobalLimit(
                  e.target.value === "" ? "" : Number(e.target.value),
                )
              }
              placeholder={m.common_unlimited()}
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase text-muted-foreground">
          {m.shop_tags()}
        </h2>
        <div className="flex flex-wrap gap-2">
          {(tags ?? []).map((tag) => {
            const checked = tagIds.includes(tag.id)
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() =>
                  setTagIds(
                    checked
                      ? tagIds.filter((id) => id !== tag.id)
                      : [...tagIds, tag.id],
                  )
                }
                className={`rounded-full border px-1 py-0.5 ${
                  checked ? "ring-2 ring-primary" : "opacity-60"
                }`}
              >
                <TagBadge tag={tag} />
              </button>
            )
          })}
          {tags && tags.length === 0 ? (
            <span className="text-xs text-muted-foreground">
              {m.shop_no_tags()}
            </span>
          ) : null}
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="prod-sort">{m.shop_sort_order()}</Label>
          <Input
            id="prod-sort"
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value))}
          />
        </div>
        <div className="flex items-center gap-3 pt-6">
          <Switch
            id="prod-active"
            checked={isActive}
            onCheckedChange={(c) => setIsActive(c === true)}
          />
          <Label htmlFor="prod-active">{m.common_active()}</Label>
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button type="submit" disabled={isPending}>
        {isPending ? m.common_saving() : (submitLabel ?? m.common_create())}
      </Button>
    </form>
  )
}
