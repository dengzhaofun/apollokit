/**
 * Table for the end-user list page. Wraps the shared `DataTable` with
 * the column definitions for a player row.
 */
import type { ColumnDef } from "@tanstack/react-table"
import { Link } from "@tanstack/react-router"
import { Ban, CheckCircle2, Crown, LinkIcon } from "lucide-react"

import { Badge } from "#/components/ui/badge"
import { DataTable } from "#/components/data-table/DataTable"
import type { EndUser } from "#/lib/types/end-user"
import * as m from "#/paraglide/messages.js"

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

const columns: ColumnDef<EndUser>[] = [
  {
    accessorKey: "name",
    header: () => m.end_user_col_name(),
    cell: ({ row }) => (
      <Link
        to="/end-user/$id"
        params={{ id: row.original.id }}
        className="font-medium hover:underline"
      >
        {row.original.name}
      </Link>
    ),
  },
  {
    accessorKey: "email",
    header: () => m.end_user_col_email(),
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">{row.original.email}</span>
    ),
  },
  {
    accessorKey: "externalId",
    header: () => m.end_user_col_external_id(),
    cell: ({ row }) =>
      row.original.externalId ? (
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
          {row.original.externalId}
        </code>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      ),
  },
  {
    accessorKey: "origin",
    header: () => m.end_user_col_origin(),
    cell: ({ row }) =>
      row.original.origin === "managed" ? (
        <Badge variant="secondary" className="gap-1">
          <Crown className="size-3" />
          {m.end_user_origin_managed()}
        </Badge>
      ) : (
        <Badge variant="outline" className="gap-1">
          <LinkIcon className="size-3" />
          {m.end_user_origin_synced()}
        </Badge>
      ),
  },
  {
    accessorKey: "sessionCount",
    header: () => m.end_user_col_sessions(),
    cell: ({ row }) => (
      <span className="tabular-nums text-sm">{row.original.sessionCount}</span>
    ),
  },
  {
    accessorKey: "disabled",
    header: () => m.end_user_col_status(),
    cell: ({ row }) =>
      row.original.disabled ? (
        <Badge variant="destructive" className="gap-1">
          <Ban className="size-3" />
          {m.end_user_status_disabled()}
        </Badge>
      ) : (
        <Badge variant="secondary" className="gap-1">
          <CheckCircle2 className="size-3" />
          {m.end_user_status_enabled()}
        </Badge>
      ),
  },
  {
    accessorKey: "createdAt",
    header: () => m.end_user_col_created_at(),
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground tabular-nums">
        {formatDate(row.original.createdAt)}
      </span>
    ),
  },
]

interface Props {
  data: EndUser[]
  isLoading?: boolean
  toolbar?: React.ReactNode
}

export function EndUserTable({ data, isLoading, toolbar }: Props) {
  // `showSearch={false}` — the list page renders its own search box
  // that drives server-side filters; we don't want DataTable's
  // client-side filter shadowing it.
  return (
    <DataTable
      columns={columns}
      data={data}
      isLoading={isLoading}
      toolbar={toolbar}
      showSearch={false}
      getRowId={(r) => r.id}
    />
  )
}
