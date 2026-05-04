import type { AnyRoute } from "@tanstack/react-router"
import type { ColumnDef } from "@tanstack/react-table"
import { KeyRound, Link as LinkIcon } from "lucide-react"

import { Badge } from "#/components/ui/badge"
import { DataTable } from "#/components/data-table/DataTable"
import { END_USER_ACCOUNT_FILTER_DEFS, useEndUserAccounts } from "#/hooks/use-end-user-account"
import type { EndUserAccount } from "#/lib/types/end-user"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString()
}

const columns: ColumnDef<EndUserAccount>[] = [
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
    accessorKey: "providerId",
    header: () => t("认证方式", "Provider"),
    cell: ({ row }) =>
      row.original.providerId === "credential" ? (
        <Badge variant="secondary" className="gap-1">
          <KeyRound className="size-3" />
          {t("邮箱密码", "Credential")}
        </Badge>
      ) : (
        <Badge variant="outline" className="gap-1">
          <LinkIcon className="size-3" />
          {row.original.providerId}
        </Badge>
      ),
  },
  {
    accessorKey: "createdAt",
    header: () => t("绑定时间", "Linked At"),
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

export function EndUserAccountTable({ route }: Props) {
  const list = useEndUserAccounts(route)
  return (
    <DataTable
      columns={columns}
      mobileLayout="cards"
      data={list.items}
      getRowId={(r) => r.id}
      filters={END_USER_ACCOUNT_FILTER_DEFS}
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
