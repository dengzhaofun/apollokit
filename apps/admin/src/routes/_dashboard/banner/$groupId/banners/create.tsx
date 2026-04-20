import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { toast } from "sonner"

import { BannerForm } from "#/components/banner/BannerForm"
import { Button } from "#/components/ui/button"
import { useCreateBanner } from "#/hooks/use-banner"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"

import { PageHeaderActions } from "#/components/PageHeader"
export const Route = createFileRoute(
  "/_dashboard/banner/$groupId/banners/create",
)({
  component: BannerCreatePage,
})

function BannerCreatePage() {
  const { groupId } = Route.useParams()
  const navigate = useNavigate()
  const mutation = useCreateBanner()

  return (
    <>
      <PageHeaderActions>
        <Button asChild variant="ghost" size="sm">
          <Link
            to="/banner/$groupId"
            params={{ groupId }}
          >
            <ArrowLeft className="size-4" />
            {m.banner_back_to_group()}
          </Link>
        </Button>
      </PageHeaderActions>

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-3xl rounded-xl border bg-card p-6 shadow-sm">
          <BannerForm
            isPending={mutation.isPending}
            submitLabel={m.common_create()}
            onSubmit={async (values) => {
              try {
                await mutation.mutateAsync({ groupId, input: values })
                toast.success(m.banner_banner_created())
                navigate({
                  to: "/banner/$groupId",
                  params: { groupId },
                })
              } catch (err) {
                if (err instanceof ApiError) toast.error(err.body.error)
                else toast.error(m.banner_failed_create_banner())
              }
            }}
          />
        </div>
      </main>
    </>
  )
}
