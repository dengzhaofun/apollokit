import { createFileRoute } from "@tanstack/react-router"
import { useNavigate } from "#/components/router-helpers"
import { toast } from "sonner"

import { TierConfigForm } from "#/components/rank/TierConfigForm"
import { useCreateRankTierConfig } from "#/hooks/use-rank"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/rank/create")({
  component: RankCreatePage,
})

function RankCreatePage() {
  const navigate = useNavigate()
  const mutation = useCreateRankTierConfig()

  return (
    <>
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-4xl rounded-xl border bg-card p-6 shadow-sm">
          <TierConfigForm
            isPending={mutation.isPending}
            submitLabel={m.rank_save()}
            onSubmit={async (values) => {
              try {
                const row = await mutation.mutateAsync(values)
                toast.success(m.rank_config_created())
                navigate({
                  to: "/o/$orgSlug/p/$projectSlug/rank/$configId",
                  params: { configId: row.id },
                })
              } catch (err) {
                if (err instanceof ApiError) toast.error(err.body.error)
                else toast.error((err as Error).message)
              }
            }}
          />
        </div>
      </main>
    </>
  )
}
