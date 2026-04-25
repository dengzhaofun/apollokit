import { createFileRoute, Link } from "@tanstack/react-router"
import { Folder, Plus, ShoppingCartIcon, Tag } from "lucide-react"
import { useState } from "react"

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import { WriteGate } from "#/components/WriteGate"
import {
  useShopCategories,
  useShopProducts,
  useShopTags,
} from "#/hooks/use-shop"
import type { ShopProductType } from "#/lib/types/shop"
import * as m from "#/paraglide/messages.js"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)

export const Route = createFileRoute("/_dashboard/shop/")({
  component: ShopProductsPage,
})

const ALL = "__all__"

function ShopProductsPage() {
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
              <Button asChild size="sm">
                <Link to="/shop/create">
                  <Plus />
                  {m.shop_new_product()}
                </Link>
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
    </PageShell>
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
