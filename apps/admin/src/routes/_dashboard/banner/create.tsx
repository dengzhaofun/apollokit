import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"

import { GroupForm } from "#/components/banner/GroupForm"
import { useCreateBannerGroup } from "#/hooks/use-banner"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/banner/create")({
  component: BannerGroupCreatePage,
})

function BannerGroupCreatePage() {
  const navigate = useNavigate()
  const mutation = useCreateBannerGroup()

  return (
    <>
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-2xl rounded-xl border bg-card p-6 shadow-sm">
          <GroupForm
            isPending={mutation.isPending}
            submitLabel={m.common_create()}
            onSubmit={async (values) => {
              try {
                const row = await mutation.mutateAsync(values)
                toast.success(m.banner_group_created())
                navigate({
                  to: "/banner/$groupId",
                  params: { groupId: row.id },
                })
              } catch (err) {
                if (err instanceof ApiError) toast.error(err.body.error)
                else toast.error(m.banner_failed_create_group())
              }
            }}
          />
        </div>
      </main>
    </>
  )
}
