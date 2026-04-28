import { ImageListField } from "#/components/forms/ImageListField"
import { MediaPickerDialog } from "#/components/media-library/MediaPickerDialog"
import { RewardEntryEditor } from "#/components/rewards/RewardEntryEditor"
import { Button } from "#/components/ui/button"
import { FieldHint } from "#/components/ui/field-hint"
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
import type {
  ShopEligibilityAnchor,
  ShopProductType,
  ShopRefreshCycle,
  ShopTimeWindowType,
} from "#/lib/types/shop"
import * as m from "#/paraglide/messages.js"
import { TagBadge } from "./TagBadge"
import type { ProductFormApi } from "./use-product-form"

interface ProductFormProps {
  /** Form instance owned by the caller — see `use-product-form.ts`. */
  form: ProductFormApi
  isPending?: boolean
  submitLabel?: string
}

export function ProductForm({ form, isPending, submitLabel }: ProductFormProps) {
  const { data: categories } = useShopCategories()
  const { data: tags } = useAllShopTags()

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
        form.handleSubmit()
      }}
      className="space-y-8"
    >
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase text-muted-foreground">
          {m.common_name()}
        </h2>
        <form.Field name="name">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor="prod-name">{m.common_name()} *</Label>
              <Input
                id="prod-name"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                required
              />
            </div>
          )}
        </form.Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <form.Field name="alias">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="prod-alias">{m.common_alias()}</Label>
                <Input
                  id="prod-alias"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              </div>
            )}
          </form.Field>
          <form.Field name="categoryId">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="prod-cat">{m.shop_category()}</Label>
                <Select
                  value={field.state.value}
                  onValueChange={(v) => field.handleChange(v ?? "")}
                >
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
            )}
          </form.Field>
        </div>
        <form.Field name="description">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor="prod-desc">{m.common_description()}</Label>
              <Textarea
                id="prod-desc"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                rows={3}
              />
            </div>
          )}
        </form.Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <form.Field name="coverImage">
            {(field) => (
              <div className="space-y-2">
                <Label>{m.shop_cover_image()}</Label>
                <MediaPickerDialog
                  value={field.state.value || null}
                  onChange={(v) => field.handleChange(v ?? "")}
                />
              </div>
            )}
          </form.Field>
          <form.Field name="galleryImages">
            {(field) => (
              <div className="space-y-2">
                <Label className="inline-flex items-center gap-1.5">
                  {m.shop_gallery_images()}
                  <FieldHint>{m.shop_gallery_hint()}</FieldHint>
                </Label>
                <ImageListField
                  value={field.state.value}
                  onChange={(v) => field.handleChange(v)}
                />
              </div>
            )}
          </form.Field>
        </div>
      </section>

      <section className="space-y-4">
        <form.Subscribe selector={(s) => s.values.productType}>
          {(productType) => (
            <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold uppercase text-muted-foreground">
              {m.shop_product_type()}
              {productType === "growth_pack" ? (
                <FieldHint>{m.shop_reward_items_hint()}</FieldHint>
              ) : null}
            </h2>
          )}
        </form.Subscribe>
        <form.Field name="productType">
          {(field) => (
            <Select
              value={field.state.value}
              onValueChange={(v) => field.handleChange(v as ShopProductType)}
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
          )}
        </form.Field>
      </section>

      <section className="space-y-6">
        <h2 className="text-sm font-semibold uppercase text-muted-foreground">
          {m.shop_cost_items()} / {m.shop_reward_items()}
        </h2>
        <form.Field name="costItems">
          {(field) => (
            <RewardEntryEditor
              label={m.shop_cost_items()}
              entries={field.state.value}
              onChange={(v) => field.handleChange(v)}
            />
          )}
        </form.Field>
        <form.Subscribe selector={(s) => s.values.productType}>
          {(productType) => (
            <form.Field name="rewardItems">
              {(field) => (
                <RewardEntryEditor
                  label={m.shop_reward_items()}
                  entries={field.state.value}
                  onChange={(v) => field.handleChange(v)}
                  hint={
                    productType === "growth_pack"
                      ? m.shop_reward_items_hint()
                      : undefined
                  }
                />
              )}
            </form.Field>
          )}
        </form.Subscribe>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase text-muted-foreground">
          {m.shop_time_window_type()}
        </h2>
        <form.Field name="timeWindowType">
          {(field) => (
            <Select
              value={field.state.value}
              onValueChange={(v) => field.handleChange(v as ShopTimeWindowType)}
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
          )}
        </form.Field>

        <form.Subscribe selector={(s) => s.values.timeWindowType}>
          {(twt) =>
            twt === "absolute" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <form.Field name="availableFrom">
                  {(field) => (
                    <div className="space-y-2">
                      <Label htmlFor="prod-from">{m.shop_available_from()}</Label>
                      <Input
                        id="prod-from"
                        type="datetime-local"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                      />
                    </div>
                  )}
                </form.Field>
                <form.Field name="availableTo">
                  {(field) => (
                    <div className="space-y-2">
                      <Label htmlFor="prod-to">{m.shop_available_to()}</Label>
                      <Input
                        id="prod-to"
                        type="datetime-local"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                      />
                    </div>
                  )}
                </form.Field>
              </div>
            ) : twt === "relative" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <form.Field name="eligibilityAnchor">
                  {(field) => (
                    <div className="space-y-2">
                      <Label htmlFor="prod-anchor">{m.shop_eligibility_anchor()}</Label>
                      <Select
                        value={field.state.value}
                        onValueChange={(v) =>
                          field.handleChange(v as ShopEligibilityAnchor)
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
                  )}
                </form.Field>
                <form.Field name="eligibilityWindowSeconds">
                  {(field) => (
                    <div className="space-y-2">
                      <Label htmlFor="prod-window">
                        {m.shop_eligibility_window_seconds()}
                      </Label>
                      <Input
                        id="prod-window"
                        type="number"
                        min={1}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) =>
                          field.handleChange(
                            e.target.value === "" ? "" : Number(e.target.value),
                          )
                        }
                      />
                    </div>
                  )}
                </form.Field>
              </div>
            ) : twt === "cyclic" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <form.Field name="refreshCycle">
                  {(field) => (
                    <div className="space-y-2">
                      <Label htmlFor="prod-cycle">{m.shop_refresh_cycle()}</Label>
                      <Select
                        value={field.state.value}
                        onValueChange={(v) =>
                          field.handleChange(v as ShopRefreshCycle)
                        }
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
                  )}
                </form.Field>
                <form.Field name="refreshLimit">
                  {(field) => (
                    <div className="space-y-2">
                      <Label htmlFor="prod-rlimit">{m.shop_refresh_limit()}</Label>
                      <Input
                        id="prod-rlimit"
                        type="number"
                        min={1}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) =>
                          field.handleChange(
                            e.target.value === "" ? "" : Number(e.target.value),
                          )
                        }
                      />
                    </div>
                  )}
                </form.Field>
              </div>
            ) : null
          }
        </form.Subscribe>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase text-muted-foreground">
          {m.shop_user_limit()} / {m.shop_global_limit()}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <form.Field name="userLimit">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="prod-ulimit">{m.shop_user_limit()}</Label>
                <Input
                  id="prod-ulimit"
                  type="number"
                  min={1}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) =>
                    field.handleChange(
                      e.target.value === "" ? "" : Number(e.target.value),
                    )
                  }
                  placeholder={m.common_unlimited()}
                />
              </div>
            )}
          </form.Field>
          <form.Field name="globalLimit">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="prod-glimit">{m.shop_global_limit()}</Label>
                <Input
                  id="prod-glimit"
                  type="number"
                  min={1}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) =>
                    field.handleChange(
                      e.target.value === "" ? "" : Number(e.target.value),
                    )
                  }
                  placeholder={m.common_unlimited()}
                />
              </div>
            )}
          </form.Field>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase text-muted-foreground">
          {m.shop_tags()}
        </h2>
        <form.Field name="tagIds">
          {(field) => (
            <div className="flex flex-wrap gap-2">
              {(tags ?? []).map((tag) => {
                const checked = field.state.value.includes(tag.id)
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() =>
                      field.handleChange(
                        checked
                          ? field.state.value.filter((id) => id !== tag.id)
                          : [...field.state.value, tag.id],
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
          )}
        </form.Field>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <form.Field name="sortOrder">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor="prod-sort">{m.shop_sort_order()}</Label>
              <Input
                id="prod-sort"
                type="number"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(Number(e.target.value))}
              />
            </div>
          )}
        </form.Field>
        <form.Field name="isActive">
          {(field) => (
            <div className="flex items-center gap-3 pt-6">
              <Switch
                id="prod-active"
                checked={field.state.value}
                onCheckedChange={(c) => field.handleChange(c === true)}
              />
              <Label htmlFor="prod-active">{m.common_active()}</Label>
            </div>
          )}
        </form.Field>
      </div>

      <form.Subscribe selector={(s) => s.values.formError}>
        {(formError) =>
          formError ? (
            <p className="text-sm text-destructive">{formError}</p>
          ) : null
        }
      </form.Subscribe>

      <Button type="submit" disabled={isPending}>
        {isPending ? m.common_saving() : (submitLabel ?? m.common_create())}
      </Button>
    </form>
  )
}
