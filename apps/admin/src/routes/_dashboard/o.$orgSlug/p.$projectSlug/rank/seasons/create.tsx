import { createFileRoute } from "@tanstack/react-router"
import { useNavigate } from "#/components/router-helpers"
import { toast } from "sonner"

import { SeasonForm } from "#/components/rank/SeasonForm"
import { useSeasonForm } from "#/components/rank/use-season-form"
import { useCreateRankSeason, useRankTierConfigs } from "#/hooks/use-rank"
import { ApiError } from "#/lib/api-client"
import type { RankTierConfig } from "#/lib/types/rank"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/rank/seasons/create")({
  component: RankSeasonCreatePage,
})

function RankSeasonCreatePage() {
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
            <CreateSeasonPanel tierConfigs={tierConfigs ?? []} />
          )}
        </div>
      </main>
    </>
  )
}

/**
 * Sub-component so `useSeasonForm` only mounts when tierConfigs are
 * loaded — its defaultValues key off `tierConfigs[0].id`.
 */
function CreateSeasonPanel({ tierConfigs }: { tierConfigs: RankTierConfig[] }) {
  const navigate = useNavigate()
  const mutation = useCreateRankSeason()
  const form = useSeasonForm({
    tierConfigs,
    onSubmit: async (values) => {
      try {
        const row = await mutation.mutateAsync(values)
        toast.success(m.rank_season_created())
        navigate({
          to: "/o/$orgSlug/p/$projectSlug/rank/seasons/$seasonId",
          params: { seasonId: row.id },
        })
      } catch (err) {
        if (err instanceof ApiError) toast.error(err.body.error)
        else toast.error((err as Error).message)
      }
    },
  })
  return (
    <SeasonForm
      form={form}
      tierConfigs={tierConfigs}
      isPending={mutation.isPending}
      submitLabel={m.rank_save()}
    />
  )
}
