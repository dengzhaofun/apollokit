import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { toast } from "sonner"

import { ProductForm } from "#/components/shop/ProductForm"
import { Button } from "#/components/ui/button"
import { Separator } from "#/components/ui/separator"
import { SidebarTrigger } from "#/components/ui/sidebar"
import { useCreateShopProduct } from "#/hooks/use-shop"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/shop/create")({
  component: ShopCreatePage,
})

function ShopCreatePage() {
  const navigate = useNavigate()
  const createMutation = useCreateShopProduct()

  return (
    <>
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-2 h-4" />
        <h1 className="text-sm font-semibold">{m.shop_new_product()}</h1>
      </header>

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
              isPending={createMutation.isPending}
              submitLabel={m.common_create()}
              onSubmit={async (input) => {
                try {
                  const product = await createMutation.mutateAsync(input)
                  toast.success(m.shop_product_created())
                  navigate({
                    to: "/shop/$productId",
                    params: { productId: product.id },
                  })
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
