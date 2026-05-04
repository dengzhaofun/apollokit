import { useTenantParams } from "#/hooks/use-tenant-params"
import { Link, type AnyRoute} from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"

import { DataTable } from "#/components/data-table/DataTable"
import { Badge } from "#/components/ui/badge"
import {
  ANNOUNCEMENT_FILTER_DEFS,
  useAnnouncements,
} from "#/hooks/use-announcement"
import { openEditModal } from "#/lib/modal-search"
import * as m from "#/paraglide/messages.js"
import type {
  Announcement,
  AnnouncementKind,
  AnnouncementSeverity,
} from "#/lib/types/announcement"

function kindLabel(k: AnnouncementKind): string {
  switch (k) {
    case "modal":
      return m.announcement_kind_modal_short()
    case "feed":
      return m.announcement_kind_feed_short()
    case "ticker":
      return m.announcement_kind_ticker_short()
  }
}

function severityLabel(s: AnnouncementSeverity): string {
  switch (s) {
    case "info":
      return m.announcement_severity_info_short()
    case "warning":
      return m.announcement_severity_warning_short()
    case "urgent":
      return m.announcement_severity_urgent_short()
  }
}

const SEVERITY_VARIANT: Record<
  AnnouncementSeverity,
  "default" | "secondary" | "destructive"
> = {
  info: "secondary",
  warning: "default",
  urgent: "destructive",
}

function formatWindow(from: string | null, until: string | null): string {
  if (!from && !until) return m.announcement_window_forever()
  const f = from
    ? format(new Date(from), "MM-dd HH:mm")
    : m.announcement_window_immediate()
  const u = until
    ? format(new Date(until), "MM-dd HH:mm")
    : m.announcement_window_never_ends()
  return `${f} → ${u}`
}

function useColumns(): ColumnDef<Announcement>[] {
  const { orgSlug, projectSlug } = useTenantParams()
  return [
  {
    accessorKey: "alias",
    header: () => m.announcement_col_alias_title(),
    cell: ({ row }) => (
      <Link
        to="/o/$orgSlug/p/$projectSlug/announcement" params={{ orgSlug, projectSlug }}
        search={(prev: Record<string, unknown>) => ({ ...prev, ...openEditModal(row.original.alias) })}
        className="block"
      >
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
          {row.original.alias}
        </code>
        <div className="mt-1 font-medium hover:underline">
          {row.original.title}
        </div>
      </Link>
    ),
  },
  {
    accessorKey: "kind",
    header: () => m.announcement_col_kind(),
    cell: ({ row }) => (
      <Badge variant="outline">{kindLabel(row.original.kind)}</Badge>
    ),
  },
  {
    accessorKey: "severity",
    header: () => m.announcement_col_severity(),
    cell: ({ row }) => (
      <Badge variant={SEVERITY_VARIANT[row.original.severity]}>
        {severityLabel(row.original.severity)}
      </Badge>
    ),
  },
  {
    id: "window",
    header: () => m.announcement_col_window(),
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {formatWindow(row.original.visibleFrom, row.original.visibleUntil)}
      </span>
    ),
  },
  {
    accessorKey: "priority",
    header: () => m.announcement_col_priority(),
    cell: ({ row }) => (
      <span className="text-center tabular-nums">{row.original.priority}</span>
    ),
  },
  {
    accessorKey: "isActive",
    header: () => m.announcement_col_status(),
    cell: ({ row }) => (
      <Badge variant={row.original.isActive ? "default" : "outline"}>
        {row.original.isActive
          ? m.announcement_status_active()
          : m.announcement_status_inactive()}
      </Badge>
    ),
  },
  {
    accessorKey: "updatedAt",
    header: () => m.announcement_col_updated(),
    cell: ({ row }) => (
      <span className="text-muted-foreground tabular-nums text-sm">
        {format(new Date(row.original.updatedAt), "yyyy-MM-dd HH:mm")}
      </span>
    ),
  },
  ]
}

interface Props {
  route: AnyRoute
}

export function AnnouncementTable({ route }: Props) {
  const columns = useColumns()
  const list = useAnnouncements(route)
  return (
    <DataTable
      columns={columns}
      mobileLayout="cards"
      data={list.items}
      getRowId={(r) => r.id}
      filters={ANNOUNCEMENT_FILTER_DEFS}
      filterValues={list.filters}
      onFilterChange={list.setFilter}
      onResetFilters={list.resetFilters}
      hasActiveFilters={list.hasActiveFilters}
      activeFilterCount={list.activeFilterCount}
      mode={list.mode}
      onModeChange={list.setMode}
      advancedQuery={
        list.advanced as
          | import("#/components/ui/query-builder").RuleGroupType
          | undefined
      }
      onAdvancedQueryChange={list.setAdvanced}
      {...list.tableProps}
    />
  )
}
