import { createFileRoute, Link } from "@tanstack/react-router"
import { Plus, Tag, Folder } from "lucide-react"
import { useState } from "react"

import { ProductTable } from "#/components/shop/ProductTable"
import { Button } from "#/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import { Separator } from "#/components/ui/separator"
import { SidebarTrigger } from "#/components/ui/sidebar"
import {
  useShopCategories,
  useShopProducts,
  useShopTags,
} from "#/hooks/use-shop"
import type { ShopProductType } from "#/lib/types/shop"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/shop/")({
  component: ShopProductsPage,
})

const ALL = "__all__"

function ShopProductsPage() {
  const [productType, setProductType] = useState<string>(ALL)
  const [categoryId, setCategoryId] = useState<string>(ALL)
  const [tagId, setTagId] = useState<string>(ALL)

  const { data: categories } = useShopCategories()
  const { data: tags } = useShopTags()
  const {
    data: products,
    isPending,
    error,
  } = useShopProducts({
    productType:
      productType === ALL ? undefined : (productType as ShopProductType),
    categoryId: categoryId === ALL ? undefined : categoryId,
    tagId: tagId === ALL ? undefined : tagId,
  })

  return (
    <>
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-2 h-4" />
        <h1 className="text-sm font-semibold">{m.shop_title()}</h1>
        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/shop/categories">
              <Folder className="size-4" />
              {m.shop_categories()}
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/shop/tags">
              <Tag className="size-4" />
              {m.shop_tags()}
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/shop/create">
              <Plus className="size-4" />
              {m.shop_new_product()}
            </Link>
          </Button>
        </div>
      </header>

      <main className="flex-1 space-y-4 p-6">
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
              ...(tags ?? []).map((t) => ({ value: t.id, label: t.name })),
            ]}
          />
        </div>

        {isPending ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            {m.common_loading()}
          </div>
        ) : error ? (
          <div className="flex h-40 items-center justify-center text-destructive">
            {m.shop_failed_load_products()} {error.message}
          </div>
        ) : (
          <div className="rounded-xl border bg-card shadow-sm">
            <ProductTable data={products ?? []} />
          </div>
        )}
      </main>
    </>
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
