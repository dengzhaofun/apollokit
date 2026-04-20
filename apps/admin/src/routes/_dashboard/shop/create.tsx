import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { toast } from "sonner"

import { ProductForm } from "#/components/shop/ProductForm"
import { Button } from "#/components/ui/button"
import { useCreateShopProduct } from "#/hooks/use-shop"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"

type ShopCreateSearch = {
  activityId?: string
  returnTo?: string
}

export const Route = createFileRoute("/_dashboard/shop/create")({
  component: ShopCreatePage,
  validateSearch: (raw: Record<string, unknown>): ShopCreateSearch => ({
    activityId:
      typeof raw.activityId === "string" ? raw.activityId : undefined,
    returnTo: typeof raw.returnTo === "string" ? raw.returnTo : undefined,
  }),
})

function ShopCreatePage() {
  const navigate = useNavigate()
  const { activityId, returnTo } = Route.useSearch()
  const createMutation = useCreateShopProduct()

  return (
    <>
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <Button variant="outline" size="sm" asChild>
            <Link to="/shop">
              <ArrowLeft className="size-4" />
              {m.shop_back_to_products()}
            </Link>
          </Button>
          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <ProductForm
              defaultValues={activityId ? { activityId } : undefined}
              isPending={createMutation.isPending}
              submitLabel={m.common_create()}
              onSubmit={async (input) => {
                try {
                  const product = await createMutation.mutateAsync({
                    ...input,
                    activityId: activityId ?? input.activityId ?? null,
                  })
                  toast.success(m.shop_product_created())
                  if (returnTo) {
                    window.location.href = `${returnTo}${returnTo.includes("?") ? "&" : "?"}createdRefId=${product.id}`
                  } else {
                    navigate({
                      to: "/shop/$productId",
                      params: { productId: product.id },
                    })
                  }
                } catch (err) {
                  toast.error(
                    err instanceof ApiError
                      ? err.body.error
                      : m.shop_failed_create_product(),
                  )
                }
              }}
            />
          </div>
        </div>
      </main>
    </>
  )
}
