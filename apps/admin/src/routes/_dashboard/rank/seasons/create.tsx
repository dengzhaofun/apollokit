import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"

import { SeasonForm } from "#/components/rank/SeasonForm"
import { useCreateRankSeason, useRankTierConfigs } from "#/hooks/use-rank"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/rank/seasons/create")({
  component: RankSeasonCreatePage,
})

function RankSeasonCreatePage() {
  const navigate = useNavigate()
  const mutation = useCreateRankSeason()
  const { data: tierConfigs, isPending, error } = useRankTierConfigs()

  return (
    <>
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-2xl rounded-xl border bg-card p-6 shadow-sm">
          {isPending ? (
            <div className="text-muted-foreground">{m.rank_loading()}</div>
          ) : error ? (
            <div className="text-destructive">
              {m.rank_failed_load()} {error.message}
            </div>
          ) : (
            <SeasonForm
              tierConfigs={tierConfigs ?? []}
              isPending={mutation.isPending}
              submitLabel={m.rank_save()}
              onSubmit={async (values) => {
                try {
                  const row = await mutation.mutateAsync(values)
                  toast.success(m.rank_season_created())
                  navigate({
                    to: "/rank/seasons/$seasonId",
                    params: { seasonId: row.id },
                  })
                } catch (err) {
                  if (err instanceof ApiError) toast.error(err.body.error)
                  else toast.error((err as Error).message)
                }
              }}
            />
          )}
        </div>
      </main>
    </>
  )
}
