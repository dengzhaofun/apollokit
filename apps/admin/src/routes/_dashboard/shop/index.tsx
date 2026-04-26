import { createFileRoute, Link } from "@tanstack/react-router"
import { Folder, Plus, ShoppingCartIcon, Tag } from "lucide-react"
import { useState } from "react"

import {
  ActivityScopeFilter,
  scopeToFilter,
  type ActivityScope,
} from "#/components/activity/ActivityScopeFilter"
import {
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
import { useAllShopTags, useShopCategories } from "#/hooks/use-shop"
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

  // Filter dropdowns need full lists (categories is non-paginated; tags via the
  // 200-cap "all" hook). The actual product list is paginated server-side
  // inside <ProductTable />.
  const { data: categories } = useShopCategories()
  const { data: tags } = useAllShopTags()

  return (
    <PageShell>
      <PageHeader
        icon={<ShoppingCartIcon className="size-5" />}
        title={t("商城", "Shop")}
        description={t("商品分页 / 搜索均走服务端。", "Products are paginated and searched server-side.")}
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

        <ProductTable
          productType={productType === ALL ? undefined : (productType as ShopProductType)}
          categoryId={categoryId === ALL ? undefined : categoryId}
          tagId={tagId === ALL ? undefined : tagId}
          activityFilter={scopeToFilter(scope)}
        />
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
