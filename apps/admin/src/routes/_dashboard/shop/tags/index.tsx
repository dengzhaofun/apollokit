import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { toast } from "sonner"

import { CreateTagInlineForm, TagList } from "#/components/shop/TagList"
import { Button } from "#/components/ui/button"
import { useCreateShopTag, useShopTags } from "#/hooks/use-shop"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/shop/tags/")({
  component: ShopTagsPage,
})

function ShopTagsPage() {
  const { data: tags, isPending, error } = useShopTags()
  const createMutation = useCreateShopTag()

  return (
    <>
      <main className="flex-1 space-y-6 p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          <Button variant="outline" size="sm" asChild>
            <Link to="/shop">
              <ArrowLeft className="size-4" />
              {m.shop_back_to_products()}
            </Link>
          </Button>

          <CreateTagInlineForm
            isPending={createMutation.isPending}
            onSubmit={async (input) => {
              try {
                await createMutation.mutateAsync(input)
                toast.success(m.shop_tag_created())
              } catch (err) {
                toast.error(
                  err instanceof ApiError
                    ? err.body.error
                    : m.shop_failed_create_tag(),
                )
              }
            }}
          />

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
              <TagList tags={tags ?? []} />
            </div>
          )}
        </div>
      </main>
    </>
  )
}
