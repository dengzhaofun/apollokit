import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, Layers } from "lucide-react"
import { toast } from "sonner"

import { ShopDeleteDialog } from "#/components/shop/DeleteDialog"
import { ProductForm } from "#/components/shop/ProductForm"
import { useProductForm } from "#/components/shop/use-product-form"
import { Button } from "#/components/ui/button"
import {
  useDeleteShopProduct,
  useShopProduct,
  useUpdateShopProduct,
} from "#/hooks/use-shop"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"

import { PageHeaderActions } from "#/components/PageHeader"
export const Route = createFileRoute("/_dashboard/shop/$productId/")({
  component: ShopProductEditPage,
})

function ShopProductEditPage() {
  const { productId } = Route.useParams()
  const navigate = useNavigate()
  const { data: product, isPending, error } = useShopProduct(productId)
  const updateMutation = useUpdateShopProduct()
  const deleteMutation = useDeleteShopProduct()

  return (
    <>
      <PageHeaderActions>
        <div className="ml-auto flex items-center gap-2">
          {product?.productType === "growth_pack" ? (
            <Button asChild variant="outline" size="sm">
              <Link
                to="/shop/$productId/stages"
                params={{ productId }}
              >
                <Layers className="size-4" />
                {m.shop_manage_stages()}
              </Link>
            </Button>
          ) : null}
          {product ? (
            <ShopDeleteDialog
              title={m.shop_delete_product_title()}
              description={m.shop_delete_product_desc()}
              isPending={deleteMutation.isPending}
              onConfirm={async () => {
                try {
                  await deleteMutation.mutateAsync(product.id)
                  toast.success(m.shop_product_deleted())
                  navigate({ to: "/shop" })
                } catch (err) {
                  toast.error(
                    err instanceof ApiError
                      ? err.body.error
                      : m.shop_failed_delete_product(),
                  )
                }
              }}
            />
          ) : null}
        </div>
      </PageHeaderActions>

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <Button variant="outline" size="sm" asChild>
            <Link to="/shop">
              <ArrowLeft className="size-4" />
              {m.shop_back_to_products()}
            </Link>
          </Button>

          {isPending ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              {m.common_loading()}
            </div>
          ) : error || !product ? (
            <div className="flex h-40 items-center justify-center text-destructive">
              {error?.message ?? m.shop_failed_load_products()}
            </div>
          ) : (
            <div className="rounded-xl border bg-card p-6 shadow-sm">
              <EditShopProductPanel
                product={product}
                isPending={updateMutation.isPending}
                onSave={async (input) => {
                  try {
                    await updateMutation.mutateAsync({
                      id: product.id,
                      ...input,
                    })
                    toast.success(m.shop_product_updated())
                  } catch (err) {
                    toast.error(
                      err instanceof ApiError
                        ? err.body.error
                        : m.shop_failed_update_product(),
                    )
                  }
                }}
              />
            </div>
          )}
        </div>
      </main>
    </>
  )
}

function EditShopProductPanel({
  product,
  isPending,
  onSave,
}: {
  product: NonNullable<ReturnType<typeof useShopProduct>["data"]>
  isPending: boolean
  onSave: (input: Parameters<NonNullable<Parameters<typeof useProductForm>[0]["onSubmit"]>>[0]) => void | Promise<void>
}) {
  const form = useProductForm({
    defaultValues: {
      categoryId: product.categoryId,
      alias: product.alias,
      name: product.name,
      description: product.description,
      coverImage: product.coverImage,
      galleryImages: product.galleryImages,
      productType: product.productType,
      costItems: product.costItems,
      rewardItems: product.rewardItems,
      timeWindowType: product.timeWindowType,
      availableFrom: product.availableFrom,
      availableTo: product.availableTo,
      eligibilityAnchor: product.eligibilityAnchor,
      eligibilityWindowSeconds: product.eligibilityWindowSeconds,
      refreshCycle: product.refreshCycle,
      refreshLimit: product.refreshLimit,
      userLimit: product.userLimit,
      globalLimit: product.globalLimit,
      sortOrder: product.sortOrder,
      isActive: product.isActive,
      tagIds: product.tags.map((t) => t.id),
    },
    onSubmit: onSave,
  })
  return (
    <ProductForm
      form={form}
      isPending={isPending}
      submitLabel={m.common_save_changes()}
    />
  )
}
