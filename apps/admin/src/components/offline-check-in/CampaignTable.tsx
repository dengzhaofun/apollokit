/**
 * Paginated table of offline-check-in campaigns. Mirrors check-in's
 * `ConfigTable.tsx` — same DataTable wiring and url-driven list-search.
 */
import { Link } from "#/components/router-helpers"
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { useMemo } from "react"

import { DataTable } from "#/components/data-table/DataTable"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu"
import {
  OFFLINE_CHECKIN_CAMPAIGN_FILTER_DEFS,
  useOfflineCheckInCampaigns,
} from "#/hooks/use-offline-check-in"
import type { OfflineCheckInCampaign } from "#/lib/types/offline-check-in"
import * as m from "#/paraglide/messages.js"

function statusLabels(): Record<string, string> {
  return {
    draft: m.offline_checkin_status_draft(),
    published: m.offline_checkin_status_published(),
    active: m.offline_checkin_status_active(),
    ended: m.offline_checkin_status_ended(),
  }
}

function modeLabels(): Record<string, string> {
  return {
    collect: m.offline_checkin_mode_collect(),
    daily: m.offline_checkin_mode_daily(),
  }
}

const columnHelper = createColumnHelper<OfflineCheckInCampaign>()

function ActionsCell({ campaign }: { campaign: OfflineCheckInCampaign }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" className="size-8">
            <MoreHorizontal className="size-4" />
            <span className="sr-only">{m.common_actions()}</span>
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          render={
            <Link
              to="/offline-check-in/$campaignId"
              params={{ campaignId: campaign.id }}
            >
              <Pencil className="size-4" />
              {m.common_edit()}
            </Link>
          }
        />
        <DropdownMenuItem
          render={
            <Link
              to="/offline-check-in/$campaignId"
              params={{ campaignId: campaign.id }}
              search={{ delete: true }}
            >
              <Trash2 className="size-4" />
              {m.common_delete()}
            </Link>
          }
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function useColumns(): ColumnDef<OfflineCheckInCampaign, unknown>[] {
  return useMemo(
    () => [
      columnHelper.accessor("name", {
        header: () => m.common_name(),
        cell: (info) => (
          <Link
            to="/offline-check-in/$campaignId"
            params={{ campaignId: info.row.original.id }}
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
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
              {alias}
            </code>
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        },
      }),
      columnHelper.accessor("mode", {
        header: () => m.offline_checkin_mode(),
        cell: (info) => (
          <Badge variant="secondary">
            {modeLabels()[info.getValue()] ?? info.getValue()}
          </Badge>
        ),
      }),
      columnHelper.accessor("status", {
        header: () => m.offline_checkin_status(),
        cell: (info) => {
          const status = info.getValue()
          const variant =
            status === "active"
              ? "default"
              : status === "draft"
                ? "outline"
                : "secondary"
          return (
            <Badge variant={variant}>
              {statusLabels()[status] ?? status}
            </Badge>
          )
        },
      }),
      columnHelper.accessor("startAt", {
        header: () => m.offline_checkin_start_at(),
        cell: (info) => {
          const v = info.getValue()
          return v ? (
            <span>{format(new Date(v), "yyyy-MM-dd HH:mm")}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        },
      }),
      columnHelper.accessor("createdAt", {
        header: () => m.common_created(),
        cell: (info) => format(new Date(info.getValue()), "yyyy-MM-dd"),
      }),
      columnHelper.display({
        id: "actions",
        header: "",
        cell: (info) => <ActionsCell campaign={info.row.original} />,
      }),
    ],
    [],
  ) as ColumnDef<OfflineCheckInCampaign, unknown>[]
}

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  route: any
}

export function CampaignTable({ route }: Props) {
  const list = useOfflineCheckInCampaigns(route)
  const columns = useColumns()
  return (
    <DataTable
      columns={columns}
      mobileLayout="cards"
      data={list.items}
      getRowId={(row) => row.id}
      filters={OFFLINE_CHECKIN_CAMPAIGN_FILTER_DEFS}
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

