import { useLeaderboardTop } from "#/hooks/use-leaderboard"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import * as m from "#/paraglide/messages.js"

export function LeaderboardLivePreview({ alias }: { alias: string }) {
  const { data, isPending, error } = useLeaderboardTop(alias, { limit: 20 })

  if (isPending)
    return <div className="text-sm text-muted-foreground">{m.common_loading()}</div>
  if (error)
    return (
      <div className="text-sm text-destructive">
        {m.leaderboard_preview_failed({ error: error.message })}
      </div>
    )
  if (!data)
    return <div className="text-sm text-muted-foreground">{m.leaderboard_no_data()}</div>

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span>
          {m.leaderboard_current_period()}:{" "}
          <code className="rounded bg-muted px-1">{data.cycleKey}</code>
        </span>
        <span>
          {m.leaderboard_scope_key()}:{" "}
          <code className="rounded bg-muted px-1">{data.scopeKey}</code>
        </span>
        <span>{m.leaderboard_total_count({ count: data.rankings.length })}</span>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">{m.leaderboard_col_rank()}</TableHead>
            <TableHead>{m.leaderboard_col_player_id()}</TableHead>
            <TableHead className="text-right">{m.leaderboard_col_score()}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.rankings.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} className="h-20 text-center">
                {m.leaderboard_no_entries()}
              </TableCell>
            </TableRow>
          ) : (
            data.rankings.map((r) => (
              <TableRow key={r.endUserId}>
                <TableCell className="font-mono">#{r.rank}</TableCell>
                <TableCell>
                  <code className="text-xs">{r.endUserId}</code>
                </TableCell>
                <TableCell className="text-right font-mono">
                  {r.score.toLocaleString()}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
