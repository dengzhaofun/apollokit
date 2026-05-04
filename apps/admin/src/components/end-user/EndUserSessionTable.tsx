import type { AnyRoute } from "@tanstack/react-router"
import type { ColumnDef } from "@tanstack/react-table"

import { DataTable } from "#/components/data-table/DataTable"
import { END_USER_SESSION_FILTER_DEFS, useEndUserSessions } from "#/hooks/use-end-user-session"
import type { EndUserSession } from "#/lib/types/end-user"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString()
}

const columns: ColumnDef<EndUserSession>[] = [
  {
    accessorKey: "userId",
    header: () => t("玩家 ID", "User ID"),
    cell: ({ row }) => (
      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
        {row.original.userId}
      </code>
    ),
  },
  {
    accessorKey: "ipAddress",
    header: () => t("IP 地址", "IP Address"),
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {row.original.ipAddress ?? "—"}
      </span>
    ),
  },
  {
    accessorKey: "userAgent",
    header: () => t("User Agent", "User Agent"),
    cell: ({ row }) => (
      <span
        className="max-w-xs truncate text-xs text-muted-foreground"
        title={row.original.userAgent ?? undefined}
      >
        {row.original.userAgent ?? "—"}
      </span>
    ),
  },
  {
    accessorKey: "expiresAt",
    header: () => t("过期时间", "Expires At"),
    cell: ({ row }) => (
      <span className="text-sm tabular-nums">
        {formatDate(row.original.expiresAt)}
      </span>
    ),
  },
  {
    accessorKey: "createdAt",
    header: () => t("创建时间", "Created At"),
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground tabular-nums">
        {formatDate(row.original.createdAt)}
      </span>
    ),
  },
]

interface Props {
  route: AnyRoute
}

export function EndUserSessionTable({ route }: Props) {
  const list = useEndUserSessions(route)
  return (
    <DataTable
      columns={columns}
      mobileLayout="cards"
      data={list.items}
      getRowId={(r) => r.id}
      filters={END_USER_SESSION_FILTER_DEFS}
      filterValues={list.filters}
      onFilterChange={list.setFilter}
      onResetFilters={list.resetFilters}
      hasActiveFilters={list.hasActiveFilters}
      activeFilterCount={list.activeFilterCount}
      mode={list.mode}
      onModeChange={list.setMode}
      {...list.tableProps}
    />
  )
}
