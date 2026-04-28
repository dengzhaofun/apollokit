import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { toast } from "sonner"

import { StageForm } from "#/components/shop/StageForm"
import { StageList } from "#/components/shop/StageList"
import { Button } from "#/components/ui/button"
import {
  useCreateShopStage,
  useShopProduct,
  useShopStages,
} from "#/hooks/use-shop"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/shop/$productId/stages")({
  component: ShopStagesPage,
})

function ShopStagesPage() {
  const { productId } = Route.useParams()
  const { data: product } = useShopProduct(productId)
  const { data: stages, isPending, error } = useShopStages(productId)
  const createMutation = useCreateShopStage()

  return (
    <>
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          <Button
            render={
              <Link to="/shop/$productId" params={{ productId }}>
                <ArrowLeft className="size-4" />
                {m.common_back()}
              </Link>
            }
            variant="outline" size="sm"
          />

          {product && product.productType !== "growth_pack" ? (
            <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground shadow-sm">
              {m.shop_growth_only()}
            </div>
          ) : (
            <>
              <section className="space-y-3">
                <h2 className="text-sm font-semibold">{m.shop_stages()}</h2>
                {isPending ? (
                  <div className="flex h-24 items-center justify-center text-muted-foreground">
                    {m.common_loading()}
                  </div>
                ) : error ? (
                  <div className="flex h-24 items-center justify-center text-destructive">
                    {error.message}
                  </div>
                ) : (
                  <div className="rounded-xl border bg-card shadow-sm">
                    <StageList stages={stages ?? []} />
                  </div>
                )}
              </section>

              <section className="space-y-3">
                <h2 className="text-sm font-semibold">{m.shop_new_stage()}</h2>
                <div className="rounded-xl border bg-card p-6 shadow-sm">
                  <StageForm
                    isPending={createMutation.isPending}
                    submitLabel={m.common_create()}
                    defaultValues={{
                      stageIndex: (stages?.length ?? 0) + 1,
                    }}
                    onSubmit={async (input) => {
                      try {
                        await createMutation.mutateAsync({
                          productId,
                          ...input,
                        })
                        toast.success(m.shop_stage_created())
                      } catch (err) {
                        toast.error(
                          err instanceof ApiError
                            ? err.body.error
                            : m.shop_failed_create_stage(),
                        )
                      }
                    }}
                  />
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    </>
  )
}
