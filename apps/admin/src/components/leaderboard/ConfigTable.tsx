import { Link } from "@tanstack/react-router"
import { createColumnHelper } from "@tanstack/react-table"
import { format } from "date-fns"

import { Badge } from "#/components/ui/badge"
import { DataTable } from "#/components/data-table/DataTable"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "#/components/ui/empty"
import type { LeaderboardConfig } from "#/lib/types/leaderboard"
import * as m from "#/paraglide/messages.js"

const columnHelper = createColumnHelper<LeaderboardConfig>()

const columns = [
  columnHelper.accessor("name", {
    header: () => m.common_name(),
    cell: (info) => (
      <Link
        to="/leaderboard/$alias"
        params={{ alias: info.row.original.alias }}
        className="font-medium hover:underline"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("alias", {
    header: () => m.common_alias(),
    cell: (info) => (
      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
        {info.getValue()}
      </code>
    ),
    enableSorting: false,
  }),
  columnHelper.accessor("metricKey", {
    header: () => m.leaderboard_col_metric_key(),
    cell: (info) => (
      <code className="text-xs text-muted-foreground">{info.getValue()}</code>
    ),
  }),
  columnHelper.accessor("cycle", {
    header: () => m.leaderboard_col_period(),
    cell: (info) => <Badge variant="secondary">{info.getValue()}</Badge>,
  }),
  columnHelper.accessor("scope", {
    header: () => m.leaderboard_col_scope(),
    cell: (info) => <Badge variant="outline">{info.getValue()}</Badge>,
  }),
  columnHelper.accessor("aggregation", {
    header: () => m.leaderboard_col_aggregate(),
    cell: (info) => (
      <span className="text-muted-foreground">{info.getValue()}</span>
    ),
  }),
  columnHelper.accessor("status", {
    header: () => m.common_status(),
    cell: (info) => {
      const s = info.getValue()
      return (
        <Badge variant={s === "active" ? "default" : "outline"}>{s}</Badge>
      )
    },
  }),
  columnHelper.accessor("createdAt", {
    header: () => m.common_created(),
    cell: (info) => format(new Date(info.getValue()), "yyyy-MM-dd"),
  }),
]

export function LeaderboardConfigTable({
  data,
  isLoading,
}: {
  data: LeaderboardConfig[]
  isLoading?: boolean
}) {
  return (
    <DataTable
      columns={columns}
      data={data}
      isLoading={isLoading}
      empty={
        <Empty className="border-0">
          <EmptyHeader>
            <EmptyTitle>{m.leaderboard_table_empty()}</EmptyTitle>
            <EmptyDescription>{m.command_palette_no_results()}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      }
    />
  )
}
