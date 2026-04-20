import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { toast } from "sonner"

import { GroupForm } from "#/components/banner/GroupForm"
import { Button } from "#/components/ui/button"
import { useBannerGroup, useUpdateBannerGroup } from "#/hooks/use-banner"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"

import { PageHeaderActions } from "#/components/PageHeader"
export const Route = createFileRoute("/_dashboard/banner/$groupId/edit")({
  component: BannerGroupEditPage,
})

function BannerGroupEditPage() {
  const { groupId } = Route.useParams()
  const navigate = useNavigate()
  const { data: group, isPending } = useBannerGroup(groupId)
  const mutation = useUpdateBannerGroup()

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
        <div className="mx-auto max-w-2xl rounded-xl border bg-card p-6 shadow-sm">
          {isPending || !group ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              {m.common_loading()}
            </div>
          ) : (
            <GroupForm
              initial={group}
              isPending={mutation.isPending}
              submitLabel={m.common_save_changes()}
              onSubmit={async (values) => {
                try {
                  await mutation.mutateAsync({ id: groupId, input: values })
                  toast.success(m.banner_group_updated())
                  navigate({
                    to: "/banner/$groupId",
                    params: { groupId },
                  })
                } catch (err) {
                  if (err instanceof ApiError) toast.error(err.body.error)
                  else toast.error(m.banner_failed_update_group())
                }
              }}
            />
          )}
        </div>
      </main>
    </>
  )
}
