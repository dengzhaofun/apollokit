import { createFileRoute } from "@tanstack/react-router"
import { format } from "date-fns"
import { Flag, Play } from "lucide-react"
import { toast } from "sonner"

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
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import {
  useActivateRankSeason,
  useFinalizeRankSeason,
  useRankSeason,
  useRankSeasonMatches,
  useRankSeasonPlayers,
} from "#/hooks/use-rank"
import { ApiError } from "#/lib/api-client"
import type { RankSeasonStatus } from "#/lib/types/rank"
import * as m from "#/paraglide/messages.js"

import { PageHeaderActions } from "#/components/PageHeader"
export const Route = createFileRoute("/_dashboard/rank/seasons/$seasonId")({
  component: RankSeasonDetailPage,
})

const STATUS_VARIANT: Record<
  RankSeasonStatus,
  "default" | "secondary" | "outline"
> = {
  upcoming: "outline",
  active: "default",
  finished: "secondary",
}

function statusLabel(s: RankSeasonStatus): string {
  switch (s) {
    case "upcoming":
      return m.rank_season_status_upcoming()
    case "active":
      return m.rank_season_status_active()
    case "finished":
      return m.rank_season_status_finished()
  }
}

function RankSeasonDetailPage() {
  const { seasonId } = Route.useParams()
  const { data: season, isPending, error } = useRankSeason(seasonId)
  const { data: players } = useRankSeasonPlayers(seasonId, { limit: 50 })
  const { data: matchesResp } = useRankSeasonMatches(seasonId, { limit: 50 })
  const activate = useActivateRankSeason()
  const finalize = useFinalizeRankSeason()

  return (
    <>
      <PageHeaderActions>
        <div className="ml-auto flex items-center gap-2">
          {season?.status === "upcoming" ? (
            <Button
              variant="outline"
              size="sm"
              disabled={activate.isPending}
              onClick={async () => {
                try {
                  await activate.mutateAsync(season.id)
                  toast.success(m.rank_season_activated())
                } catch (err) {
                  if (err instanceof ApiError) toast.error(err.body.error)
                  else toast.error((err as Error).message)
                }
              }}
            >
              <Play className="size-3.5" />
              {m.rank_season_activate()}
            </Button>
          ) : null}
          {season?.status === "active" ? (
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
                  <AlertDialogCancel>{m.rank_cancel()}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={async () => {
                      try {
                        const r = await finalize.mutateAsync(season.id)
                        toast.success(
                          m.rank_season_finalized({ count: r.snapshotCount }),
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
          ) : null}
        </div>
      </PageHeaderActions>

      <main className="flex-1 space-y-6 p-6">
        {isPending ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            {m.rank_loading()}
          </div>
        ) : error ? (
          <div className="flex h-40 items-center justify-center text-destructive">
            {m.rank_failed_load()} {error.message}
          </div>
        ) : season ? (
          <>
            {/* Summary */}
            <div className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-4">
              <div>
                <div className="text-xs text-muted-foreground">
                  {m.rank_col_status()}
                </div>
                <Badge variant={STATUS_VARIANT[season.status]} className="mt-1">
                  {statusLabel(season.status)}
                </Badge>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">
                  {m.rank_season_start_at()}
                </div>
                <div className="text-sm font-medium">
                  {format(new Date(season.startAt), "yyyy-MM-dd HH:mm")}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">
                  {m.rank_season_end_at()}
                </div>
                <div className="text-sm font-medium">
                  {format(new Date(season.endAt), "yyyy-MM-dd HH:mm")}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">
                  {m.rank_season_players()}
                </div>
                <div className="text-sm font-medium">
                  {players?.length ?? 0}
                </div>
              </div>
            </div>

            {/* Players */}
            <section>
              <h2 className="mb-2 text-sm font-semibold">
                {m.rank_season_players()}
              </h2>
              <div className="rounded-xl border bg-card shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{m.rank_player_col_user()}</TableHead>
                      <TableHead>{m.rank_player_col_tier()}</TableHead>
                      <TableHead className="text-center">
                        {m.rank_player_col_subtier()}
                      </TableHead>
                      <TableHead className="text-center">
                        {m.rank_player_col_stars()}
                      </TableHead>
                      <TableHead className="text-right">
                        {m.rank_player_col_rank_score()}
                      </TableHead>
                      <TableHead className="text-right">
                        {m.rank_player_col_mmr()}
                      </TableHead>
                      <TableHead className="text-center">
                        {m.rank_player_col_wins()}/
                        {m.rank_player_col_losses()}
                      </TableHead>
                      <TableHead className="text-center">
                        {m.rank_player_col_played()}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(players ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={8}
                          className="h-20 text-center text-muted-foreground"
                        >
                          {m.rank_no_players()}
                        </TableCell>
                      </TableRow>
                    ) : (
                      players?.map((p) => (
                        <TableRow key={p.endUserId}>
                          <TableCell>
                            <Badge variant="secondary">{p.endUserId}</Badge>
                          </TableCell>
                          <TableCell>
                            {p.tier ? (
                              <span>
                                {p.tier.name}{" "}
                                <span className="text-muted-foreground text-xs">
                                  ({p.tier.alias})
                                </span>
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {p.subtier}
                          </TableCell>
                          <TableCell className="text-center">
                            {p.stars}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {p.rankScore}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {Math.round(p.mmr)}
                          </TableCell>
                          <TableCell className="text-center text-xs">
                            <span className="text-green-600">{p.wins}</span>
                            {" / "}
                            <span className="text-destructive">{p.losses}</span>
                          </TableCell>
                          <TableCell className="text-center text-muted-foreground">
                            {p.matchesPlayed}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </section>

            {/* Matches */}
            <section>
              <h2 className="mb-2 text-sm font-semibold">
                {m.rank_season_matches()}
              </h2>
              <div className="rounded-xl border bg-card shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{m.rank_match_col_external()}</TableHead>
                      <TableHead>{m.rank_match_col_game_mode()}</TableHead>
                      <TableHead className="text-center">
                        {m.rank_match_col_team_count()}
                      </TableHead>
                      <TableHead className="text-center">
                        {m.rank_match_col_participants()}
                      </TableHead>
                      <TableHead>{m.rank_match_col_settled()}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(matchesResp?.items ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="h-20 text-center text-muted-foreground"
                        >
                          {m.rank_no_matches()}
                        </TableCell>
                      </TableRow>
                    ) : (
                      matchesResp?.items.map((match) => (
                        <TableRow key={match.id}>
                          <TableCell>
                            <code className="rounded bg-muted px-1 text-xs">
                              {match.externalMatchId}
                            </code>
                          </TableCell>
                          <TableCell>
                            {match.gameMode ?? (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {match.teamCount}
                          </TableCell>
                          <TableCell className="text-center">
                            {match.totalParticipants}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {format(
                              new Date(match.settledAt),
                              "yyyy-MM-dd HH:mm",
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </section>
          </>
        ) : null}
      </main>
    </>
  )
}
