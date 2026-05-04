import { useTenantParams } from "#/hooks/use-tenant-params"
import { Link, type AnyRoute} from "@tanstack/react-router";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"
import { useMemo } from "react"

import { DataTable } from "#/components/data-table/DataTable"
import { Badge } from "#/components/ui/badge"
import { BANNER_GROUP_FILTER_DEFS, useBannerGroups } from "#/hooks/use-banner"
import type { BannerGroup } from "#/lib/types/banner"
import * as m from "#/paraglide/messages.js"

const columnHelper = createColumnHelper<BannerGroup>()

function useColumns(): ColumnDef<BannerGroup, unknown>[] {
  const { orgSlug, projectSlug } = useTenantParams()
  return useMemo(
    () => [
      columnHelper.accessor("name", {

      header: () => m.common_name(),
        cell: (info) => (
          <Link
            to="/o/$orgSlug/p/$projectSlug/banner/$groupId"
            params={{ orgSlug, projectSlug, groupId: info.row.original.id }}
            className="font-medium hover:underline"
          >
            {info.getValue()}
          </Link>
        ),
      }),
      columnHelper.accessor("alias", {
        header: () => m.common_alias(),
        cell: (info) => {
          const alias = info.getValue()
          return alias ? (
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{alias}</code>
          ) : (
            <Badge variant="outline">{m.banner_draft_badge()}</Badge>
          )
        },
      }),
      columnHelper.accessor("layout", {
        header: () => m.banner_field_layout(),
        cell: (info) => (
          <Badge variant="secondary">
            {info.getValue() === "carousel"
              ? m.banner_layout_carousel()
              : info.getValue() === "single"
                ? m.banner_layout_single()
                : m.banner_layout_grid()}
          </Badge>
        ),
      }),
      columnHelper.accessor("isActive", {
        header: () => m.common_status(),
        cell: (info) => (
          <Badge variant={info.getValue() ? "default" : "outline"}>
            {info.getValue() ? m.banner_status_active() : m.banner_status_inactive()}
          </Badge>
        ),
      }),
      columnHelper.accessor("updatedAt", {
        header: () => m.common_updated(),
        cell: (info) => (
          <span className="text-muted-foreground">
            {format(new Date(info.getValue()), "yyyy-MM-dd HH:mm")}
          </span>
        ),
      }),
    ],
    [orgSlug, projectSlug],
  ) as ColumnDef<BannerGroup, unknown>[]
}

interface Props {
  activityId?: string
  includeActivity?: boolean
  route: AnyRoute
}

export function GroupTable({ route, ...rest }: Props) {
  const list = useBannerGroups(route, rest)
  const columns = useColumns()
  return (
    <DataTable
      columns={columns}
      mobileLayout="cards"
      data={list.items}
      getRowId={(row) => row.id}
      filters={BANNER_GROUP_FILTER_DEFS}
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
