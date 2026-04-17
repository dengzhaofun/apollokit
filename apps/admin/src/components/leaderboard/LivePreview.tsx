import { useLeaderboardTop } from "#/hooks/use-leaderboard"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"

export function LeaderboardLivePreview({ alias }: { alias: string }) {
  const { data, isPending, error } = useLeaderboardTop(alias, { limit: 20 })

  if (isPending)
    return <div className="text-sm text-muted-foreground">读取中…</div>
  if (error)
    return (
      <div className="text-sm text-destructive">
        预览失败：{error.message}
      </div>
    )
  if (!data)
    return <div className="text-sm text-muted-foreground">暂无数据</div>

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span>
          当前周期:{" "}
          <code className="rounded bg-muted px-1">{data.cycleKey}</code>
        </span>
        <span>
          作用域 key:{" "}
          <code className="rounded bg-muted px-1">{data.scopeKey}</code>
        </span>
        <span>共 {data.rankings.length} 条</span>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">排名</TableHead>
            <TableHead>玩家 ID</TableHead>
            <TableHead className="text-right">分数</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.rankings.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} className="h-20 text-center">
                当前周期暂无上榜数据
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
