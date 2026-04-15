import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { toast } from "sonner"

import { BannerForm } from "#/components/banner/BannerForm"
import { Button } from "#/components/ui/button"
import { Separator } from "#/components/ui/separator"
import { SidebarTrigger } from "#/components/ui/sidebar"
import { useBanner, useUpdateBanner } from "#/hooks/use-banner"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute(
  "/_dashboard/banner/$groupId/banners/$bannerId",
)({
  component: BannerEditPage,
})

function BannerEditPage() {
  const { groupId, bannerId } = Route.useParams()
  const navigate = useNavigate()
  const { data: banner, isPending } = useBanner(bannerId)
  const mutation = useUpdateBanner()

  return (
    <>
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-2 h-4" />
        <Button asChild variant="ghost" size="sm">
          <Link
            to="/banner/$groupId"
            params={{ groupId }}
          >
            <ArrowLeft className="size-4" />
            {m.banner_back_to_group()}
          </Link>
        </Button>
        <h1 className="text-sm font-semibold">{m.banner_edit_banner()}</h1>
      </header>

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-3xl rounded-xl border bg-card p-6 shadow-sm">
          {isPending || !banner ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              {m.common_loading()}
            </div>
          ) : (
            <BannerForm
              initial={banner}
              isPending={mutation.isPending}
              submitLabel={m.common_save_changes()}
              onSubmit={async (values) => {
                try {
                  await mutation.mutateAsync({
                    id: bannerId,
                    groupId,
                    input: values,
                  })
                  toast.success(m.banner_banner_updated())
                  navigate({
                    to: "/banner/$groupId",
                    params: { groupId },
                  })
                } catch (err) {
                  if (err instanceof ApiError) toast.error(err.body.error)
                  else toast.error(m.banner_failed_update_banner())
                }
              }}
            />
          )}
        </div>
      </main>
    </>
  )
}
