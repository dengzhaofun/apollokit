import { useTenantParams } from "#/hooks/use-tenant-params";
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"

import { LeaderboardConfigForm } from "#/components/leaderboard/ConfigForm"
import { useLeaderboardForm } from "#/components/leaderboard/use-config-form"
import { useCreateLeaderboardConfig } from "#/hooks/use-leaderboard"
import { ApiError } from "#/lib/api-client"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/leaderboard/create")({
  component: LeaderboardCreatePage,
})

function LeaderboardCreatePage() {
  const navigate = useNavigate()
    const { orgSlug, projectSlug } = useTenantParams()
  const mutation = useCreateLeaderboardConfig()
  const form = useLeaderboardForm({
    onSubmit: async (values) => {
      try {
        await mutation.mutateAsync(values)
        toast.success("排行榜创建成功")
        navigate({ to: "/o/$orgSlug/p/$projectSlug/leaderboard" , params: { orgSlug, projectSlug }})
      } catch (err) {
        if (err instanceof ApiError) toast.error(err.body.error)
        else toast.error("创建失败")
      }
    },
  })

  return (
    <>
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-2xl rounded-xl border bg-card p-6 shadow-sm">
          <LeaderboardConfigForm form={form} isPending={mutation.isPending} />
        </div>
      </main>
    </>
  )
}
