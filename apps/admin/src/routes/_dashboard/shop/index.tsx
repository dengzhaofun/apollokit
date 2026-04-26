import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useForm } from "@tanstack/react-form"
import { Folder, Plus, ShoppingCartIcon, Tag } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import {
  ActivityScopeFilter,
  scopeToFilter,
  type ActivityScope,
} from "#/components/activity/ActivityScopeFilter"
import {
  EmptyList,
  ErrorState,
  PageBody,
  PageHeader,
  PageShell,
} from "#/components/patterns"
import { ProductTable } from "#/components/shop/ProductTable"
import { Button } from "#/components/ui/button"
import { FormDialog } from "#/components/ui/form-dialog"
import {
  FormStateBridge,
  type FormBridgeState,
} from "#/components/ui/form-state-bridge"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import { WriteGate } from "#/components/WriteGate"
import {
  useCreateShopProduct,
  useShopCategories,
  useShopProducts,
  useShopTags,
} from "#/hooks/use-shop"
import { ApiError } from "#/lib/api-client"
import {
  closedModal,
  modalSearchSchema,
  openCreateModal,
} from "#/lib/modal-search"
import type { ShopProductType } from "#/lib/types/shop"
import * as m from "#/paraglide/messages.js"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)
const FORM_ID = "shop-product-mini-create-form"

export const Route = createFileRoute("/_dashboard/shop/")({
  component: ShopProductsPage,
  validateSearch: modalSearchSchema,
})

const ALL = "__all__"

function ShopProductsPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })

  function closeModal() {
    void navigate({ search: (prev) => ({ ...prev, ...closedModal }) })
  }
  function openCreate() {
    void navigate({ search: (prev) => ({ ...prev, ...openCreateModal }) })
  }

  const [productType, setProductType] = useState<string>(ALL)
  const [categoryId, setCategoryId] = useState<string>(ALL)
  const [tagId, setTagId] = useState<string>(ALL)
  const [scope, setScope] = useState<ActivityScope>({ kind: "standalone" })

  const { data: categories } = useShopCategories()
  const { data: tags } = useShopTags()
  const {
    data: products,
    isPending,
    error,
    refetch,
  } = useShopProducts({
    productType:
      productType === ALL ? undefined : (productType as ShopProductType),
    categoryId: categoryId === ALL ? undefined : categoryId,
    tagId: tagId === ALL ? undefined : tagId,
    ...scopeToFilter(scope),
  })

  const total = products?.length ?? 0
  const isFiltered = productType !== ALL || categoryId !== ALL || tagId !== ALL

  return (
    <PageShell>
      <PageHeader
        icon={<ShoppingCartIcon className="size-5" />}
        title={t("商城", "Shop")}
        description={
          isPending
            ? t("加载中…", "Loading…")
            : error
              ? t("加载失败", "Failed to load")
              : t(`共 ${total} 个商品`, `${total} products total`)
        }
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to="/shop/categories">
                <Folder />
                {m.shop_categories()}
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/shop/tags">
                <Tag />
                {m.shop_tags()}
              </Link>
            </Button>
            <WriteGate>
              <Button size="sm" onClick={openCreate}>
                <Plus />
                {m.shop_new_product()}
              </Button>
            </WriteGate>
          </>
        }
      />

      <PageBody>
        <div className="flex flex-wrap items-end gap-3">
          <FilterSelect
            label={m.shop_filter_type()}
            value={productType}
            onChange={setProductType}
            options={[
              { value: ALL, label: m.shop_filter_all() },
              { value: "regular", label: m.shop_type_regular() },
              { value: "growth_pack", label: m.shop_type_growth_pack() },
            ]}
          />
          <FilterSelect
            label={m.shop_filter_category()}
            value={categoryId}
            onChange={setCategoryId}
            options={[
              { value: ALL, label: m.shop_filter_all() },
              ...(categories ?? []).map((c) => ({
                value: c.id,
                label: c.name,
              })),
            ]}
          />
          <FilterSelect
            label={m.shop_filter_tag()}
            value={tagId}
            onChange={setTagId}
            options={[
              { value: ALL, label: m.shop_filter_all() },
              ...(tags ?? []).map((tg) => ({ value: tg.id, label: tg.name })),
            ]}
          />
          <ActivityScopeFilter value={scope} onChange={setScope} />
        </div>

        {isPending ? (
          <div className="flex h-40 items-center justify-center rounded-lg border bg-card text-muted-foreground">
            {m.common_loading()}
          </div>
        ) : error ? (
          <ErrorState
            title={t("商品加载失败", "Failed to load products")}
            onRetry={() => refetch()}
            retryLabel={t("重试", "Retry")}
            error={error instanceof Error ? error : null}
          />
        ) : total === 0 ? (
          <EmptyList
            title={
              isFiltered
                ? t("没有匹配的商品", "No matching products")
                : t("还没有商品", "No products yet")
            }
            description={
              isFiltered
                ? t("调整筛选条件再试。", "Adjust filters and try again.")
                : t(
                    "上架第一个商品,设定价格和奖励组合。",
                    "List your first product with prices and reward bundles.",
                  )
            }
            action={
              !isFiltered && (
                <WriteGate>
                  <Button asChild size="sm">
                    <Link to="/shop/create">
                      <Plus />
                      {m.shop_new_product()}
                    </Link>
                  </Button>
                </WriteGate>
              )
            }
          />
        ) : (
          <div className="rounded-lg border bg-card overflow-hidden">
            <ProductTable data={products ?? []} />
          </div>
        )}
      </PageBody>

      {search.modal === "create" ? (
        <CreateShopProductMiniDialog onClose={closeModal} />
      ) : null}
    </PageShell>
  )
}

function CreateShopProductMiniDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const mutation = useCreateShopProduct()
  const [formState, setFormState] = useState<FormBridgeState>({
    canSubmit: false,
    isDirty: false,
    isSubmitting: false,
  })

  const form = useForm({
    defaultValues: {
      name: "",
      alias: "",
      productType: "regular" as ShopProductType,
    },
    onSubmit: async ({ value }) => {
      try {
        const row = await mutation.mutateAsync({
          name: value.name.trim(),
          alias: value.alias.trim() || null,
          productType: value.productType,
          costItems: [],
          rewardItems: [],
          timeWindowType: "none",
        })
        toast.success("Product created")
        onClose()
        void navigate({
          to: "/shop/$productId",
          params: { productId: row.id },
        })
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.body.error : "Failed to create product",
        )
      }
    },
  })

  return (
    <FormDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      isDirty={formState.isDirty && !mutation.isPending}
      title={m.shop_new_product()}
      description="Create with the essentials. Pricing, rewards, schedule and tags are configured on the next page."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {m.common_cancel()}
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            disabled={!formState.canSubmit || mutation.isPending}
          >
            {mutation.isPending ? m.common_saving() : m.common_create()}
          </Button>
        </>
      }
    >
      <form
        id={FORM_ID}
        onSubmit={(e) => {
          e.preventDefault()
          e.stopPropagation()
          form.handleSubmit()
        }}
        className="space-y-4"
      >
        <form.Subscribe
          selector={(s) => ({
            canSubmit: s.canSubmit,
            isDirty: s.isDirty,
            isSubmitting: s.isSubmitting,
          })}
        >
          {(state) => <FormStateBridge state={state} onChange={setFormState} />}
        </form.Subscribe>

        <form.Field
          name="name"
          validators={{
            onChange: ({ value }) => (!value.trim() ? "Name required" : undefined),
          }}
        >
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor="prod-name">{m.common_name()} *</Label>
              <Input
                id="prod-name"
                required
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            </div>
          )}
        </form.Field>

        <form.Field name="alias">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor="prod-alias">{m.common_alias()}</Label>
              <Input
                id="prod-alias"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="optional, lowercase-with-hyphens"
              />
            </div>
          )}
        </form.Field>

        <form.Field name="productType">
          {(field) => (
            <div className="space-y-2">
              <Label>{m.shop_filter_type()}</Label>
              <Select
                value={field.state.value}
                onValueChange={(v) => field.handleChange(v as ShopProductType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="regular">{m.shop_type_regular()}</SelectItem>
                  <SelectItem value="growth_pack">
                    {m.shop_type_growth_pack()}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </form.Field>
      </form>
    </FormDialog>
  )
}

interface FilterSelectProps {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}

function FilterSelect({ label, value, onChange, options }: FilterSelectProps) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
