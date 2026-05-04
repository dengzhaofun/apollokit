import { useTenantParams } from "#/hooks/use-tenant-params";
import { createFileRoute, Link } from "@tanstack/react-router"
import { Flag, Play, Plus } from "lucide-react"
import { useMemo } from "react"
import { toast } from "sonner"

import { SeasonTable } from "#/components/rank/SeasonTable"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "#/components/ui/alert-dialog"
import { Button } from "#/components/ui/button"
import {
  useActivateRankSeason,
  useFinalizeRankSeason,
  useRankSeasons,
  useRankTierConfigs,
} from "#/hooks/use-rank"
import { ApiError } from "#/lib/api-client"
import { listSearchSchema } from "#/lib/list-search"
import * as m from "#/paraglide/messages.js"
import { PageHeader } from "#/components/patterns"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/rank/seasons/")({
  component: RankSeasonsListPage,
  validateSearch: listSearchSchema.passthrough(),
})

function RankSeasonsListPage() {
  const seasonsList = useRankSeasons(Route)
  const seasons = seasonsList.items
  const isPending = seasonsList.isLoading
  const error = seasonsList.error
  const { data: tierConfigs } = useRankTierConfigs()
  const activate = useActivateRankSeason()
  const finalize = useFinalizeRankSeason()
  const { orgSlug, projectSlug } = useTenantParams()

  const tierConfigNameById = useMemo(() => {
    const map: Record<string, string> = {}
    for (const c of tierConfigs ?? []) map[c.id] = c.name
    return map
  }, [tierConfigs])

  return (
    <>
      <PageHeader
        title={m.rank_tab_seasons()}
        actions={
          <>
            <Button
              render={
                <Link to="/o/$orgSlug/p/$projectSlug/rank" params={{ orgSlug, projectSlug }}>{m.rank_tab_configs()}</Link>
              }
              variant="outline" size="sm"
            />
            <Button
              render={
                <Link to="/o/$orgSlug/p/$projectSlug/rank/seasons/create" params={{ orgSlug, projectSlug }}>
                  <Plus className="size-4" />
                  {m.rank_new_season()}
                </Link>
              }
              size="sm"
            />
          </>
        }
      />

      <main className="flex-1 p-6">
        {isPending ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            {m.rank_loading()}
          </div>
        ) : error ? (
          <div className="flex h-40 items-center justify-center text-destructive">
            {m.rank_failed_load()} {error.message}
          </div>
        ) : (
          <div className="rounded-xl border bg-card shadow-sm">
            <SeasonTable
              data={seasons}
              tierConfigNameById={tierConfigNameById}
              rightCell={(s) => {
                if (s.status === "upcoming") {
                  return (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={activate.isPending}
                      onClick={async () => {
                        try {
                          await activate.mutateAsync(s.id)
                          toast.success(m.rank_season_activated())
                        } catch (err) {
                          if (err instanceof ApiError)
                            toast.error(err.body.error)
                          else toast.error((err as Error).message)
                        }
                      }}
                    >
                      <Play className="size-3.5" />
                      {m.rank_season_activate()}
                    </Button>
                  )
                }
                if (s.status === "active") {
                  return (
                    <AlertDialog>
                      <AlertDialogTrigger
                        render={
                          <Button variant="outline" size="sm">
                            <Flag className="size-3.5" />
                            {m.rank_season_finalize()}
                          </Button>
                        }
                      />
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            {m.rank_season_finalize_title()}
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            {m.rank_season_finalize_desc()}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>
                            {m.rank_cancel()}
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={async () => {
                              try {
                                const r = await finalize.mutateAsync(s.id)
                                toast.success(
                                  m.rank_season_finalized({
                                    count: r.snapshotCount,
                                  }),
                                )
                              } catch (err) {
                                if (err instanceof ApiError)
                                  toast.error(err.body.error)
                                else toast.error((err as Error).message)
                              }
                            }}
                          >
                            {m.rank_season_finalize_confirm()}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )
                }
                return null
              }}
            />
          </div>
        )}
      </main>
    </>
  )
}
