import { Link } from "#/components/router-helpers"
import { format } from "date-fns"

import { Badge } from "#/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import type { RankSeason, RankSeasonStatus } from "#/lib/types/rank"
import * as m from "#/paraglide/messages.js"

interface Props {
  data: RankSeason[]
  tierConfigNameById?: Record<string, string>
  rightCell?: (season: RankSeason) => React.ReactNode
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

const STATUS_VARIANT: Record<
  RankSeasonStatus,
  "default" | "secondary" | "outline"
> = {
  upcoming: "outline",
  active: "default",
  finished: "secondary",
}

export function SeasonTable({ data, tierConfigNameById, rightCell }: Props) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{m.rank_col_alias()}</TableHead>
          <TableHead>{m.rank_col_name()}</TableHead>
          <TableHead>{m.rank_col_config()}</TableHead>
          <TableHead>{m.rank_col_window()}</TableHead>
          <TableHead>{m.rank_col_status()}</TableHead>
          {rightCell ? (
            <TableHead className="w-40 text-right">
              {m.rank_col_actions()}
            </TableHead>
          ) : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={rightCell ? 6 : 5}
              className="h-24 text-center text-muted-foreground"
            >
              {m.rank_no_seasons()}
            </TableCell>
          </TableRow>
        ) : (
          data.map((s) => (
            <TableRow key={s.id}>
              <TableCell>
                <Link
                  to="/rank/seasons/$seasonId"
                  params={{ seasonId: s.id }}
                  className="block"
                >
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                    {s.alias}
                  </code>
                </Link>
              </TableCell>
              <TableCell className="font-medium">{s.name}</TableCell>
              <TableCell className="text-muted-foreground text-xs">
                {tierConfigNameById?.[s.tierConfigId] ?? s.tierConfigId.slice(0, 8)}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {format(new Date(s.startAt), "yyyy-MM-dd")} →{" "}
                {format(new Date(s.endAt), "yyyy-MM-dd")}
              </TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[s.status]}>
                  {statusLabel(s.status)}
                </Badge>
              </TableCell>
              {rightCell ? (
                <TableCell className="text-right">{rightCell(s)}</TableCell>
              ) : null}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )
}
