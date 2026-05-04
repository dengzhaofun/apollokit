import type { AnyRoute } from "@tanstack/react-router"
import type { ColumnDef } from "@tanstack/react-table"

import { DataTable } from "#/components/data-table/DataTable"
import { useEndUserVerifications } from "#/hooks/use-end-user-verification"
import type { EndUserVerification } from "#/lib/types/end-user"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString()
}

const columns: ColumnDef<EndUserVerification>[] = [
  {
    accessorKey: "identifier",
    header: () => t("邮箱", "Email"),
    cell: ({ row }) => (
      <span className="text-sm">{row.original.identifier}</span>
    ),
  },
  {
    accessorKey: "expiresAt",
    header: () => t("过期时间", "Expires At"),
    cell: ({ row }) => {
      const expired = new Date(row.original.expiresAt) < new Date()
      return (
        <span className={`text-sm tabular-nums ${expired ? "text-destructive" : ""}`}>
          {formatDate(row.original.expiresAt)}
        </span>
      )
    },
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

export function EndUserVerificationTable({ route }: Props) {
  const list = useEndUserVerifications(route)
  return (
    <DataTable
      columns={columns}
      mobileLayout="cards"
      data={list.items}
      getRowId={(r) => r.id}
      filters={[]}
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
