/**
 * Entry list — paginated table over /api/cms/types/{typeAlias}/entries.
 * Status / group / tag filters are passed in by the parent route page.
 */

import { Link } from "@tanstack/react-router"
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table"
import { useMemo } from "react"

import { DataTable } from "#/components/data-table/DataTable"
import { Badge } from "#/components/ui/badge"
import { CMS_ENTRY_FILTER_DEFS, useCmsEntries } from "#/hooks/use-cms"
import type { CmsEntry, CmsEntryStatus } from "#/lib/types/cms"
import * as m from "#/paraglide/messages.js"

const STATUS_VARIANT: Record<
  CmsEntryStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  draft: "outline",
  published: "default",
  archived: "secondary",
}

const columnHelper = createColumnHelper<CmsEntry>()

function useColumns(typeAlias: string): ColumnDef<CmsEntry, unknown>[] {
  return useMemo(
    () => [
      columnHelper.accessor("alias", {
        header: () => m.common_alias(),
        cell: (info) => (
          <Link
            to="/cms/$typeAlias/$entryAlias"
            params={{ typeAlias, entryAlias: info.getValue() }}
            className="font-medium underline-offset-4 hover:underline"
          >
            {info.getValue()}
          </Link>
        ),
      }),
      columnHelper.accessor("status", {
        header: () => m.common_status(),
        cell: (info) => (
          <Badge variant={STATUS_VARIANT[info.getValue()]}>{info.getValue()}</Badge>
        ),
      }),
      columnHelper.accessor("groupKey", {
        header: () => m.cms_entry_group(),
        cell: (info) => (
          <span className="text-muted-foreground">{info.getValue() ?? "—"}</span>
        ),
      }),
      columnHelper.accessor("tags", {
        header: () => m.cms_entry_tags(),
        cell: (info) => {
          const tags = info.getValue()
          return (
            <div className="flex flex-wrap gap-1">
              {tags.length === 0 ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                tags.map((t) => (
                  <Badge key={t} variant="outline" className="text-xs">
                    {t}
                  </Badge>
                ))
              )}
            </div>
          )
        },
      }),
      columnHelper.accessor("updatedAt", {
        header: () => m.common_updated(),
        cell: (info) => (
          <span className="text-xs text-muted-foreground">
            {new Date(info.getValue()).toLocaleString()}
          </span>
        ),
      }),
    ],
    [typeAlias],
  ) as ColumnDef<CmsEntry, unknown>[]
}

interface Props {
  typeAlias: string
  status?: CmsEntryStatus
  groupKey?: string
  tag?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  route: any
}

export function EntryTable({ typeAlias, status, groupKey, tag, route }: Props) {
  const list = useCmsEntries(typeAlias, route, { status, groupKey, tag })
  const columns = useColumns(typeAlias)
  return (
    <DataTable
      columns={columns}
      data={list.items}
      getRowId={(row) => row.id}
      filters={CMS_ENTRY_FILTER_DEFS}
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
