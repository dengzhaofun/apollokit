import { createFileRoute, Link } from "@tanstack/react-router"
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table"
import { Plus } from "lucide-react"
import { useMemo } from "react"

import * as m from "#/paraglide/messages.js"
import { DataTable } from "#/components/data-table/DataTable"
import { PageHeaderActions } from "#/components/PageHeader"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import { useTeamConfigs } from "#/hooks/use-team"
import type { TeamConfig } from "#/lib/types/team"

export const Route = createFileRoute("/_dashboard/team/")({
  component: TeamPage,
})

const columnHelper = createColumnHelper<TeamConfig>()

function useColumns(): ColumnDef<TeamConfig, unknown>[] {
  return useMemo(
    () => [
      columnHelper.accessor("name", {
        header: () => m.common_name(),
        cell: (info) => (
          <Link
            to="/team/$configId"
            params={{ configId: info.row.original.id }}
            className="font-medium hover:underline"
          >
            {info.getValue()}
          </Link>
        ),
      }),
      columnHelper.accessor("alias", {
        header: () => m.common_alias(),
        cell: (info) => info.getValue() ?? "-",
      }),
      columnHelper.accessor("maxMembers", { header: () => m.team_max_members() }),
      columnHelper.accessor("autoDissolveOnLeaderLeave", {
        header: () => m.team_auto_dissolve(),
        cell: (info) => (
          <Badge variant={info.getValue() ? "default" : "secondary"}>
            {info.getValue() ? "Yes" : "No"}
          </Badge>
        ),
      }),
      columnHelper.accessor("allowQuickMatch", {
        header: () => m.team_quick_match(),
        cell: (info) => (
          <Badge variant={info.getValue() ? "default" : "secondary"}>
            {info.getValue() ? "Yes" : "No"}
          </Badge>
        ),
      }),
      columnHelper.accessor("createdAt", {
        header: () => m.common_created(),
        cell: (info) => new Date(info.getValue()).toLocaleDateString(),
      }),
    ],
    [],
  ) as ColumnDef<TeamConfig, unknown>[]
}

function TeamPage() {
  const list = useTeamConfigs()
  const columns = useColumns()

  return (
    <>
      <PageHeaderActions>
        <div className="ml-auto">
          <Button size="sm" asChild>
            <Link to="/team/create">
              <Plus className="size-4" />
              {m.team_new_config()}
            </Link>
          </Button>
        </div>
      </PageHeaderActions>

      <main className="flex-1 p-6">
        <DataTable
          columns={columns}
          data={list.items}
          isLoading={list.isLoading}
          getRowId={(row) => row.id}
          pageIndex={list.pageIndex}
          canPrev={list.canPrev}
          canNext={list.canNext}
          onNextPage={list.nextPage}
          onPrevPage={list.prevPage}
          pageSize={list.pageSize}
          onPageSizeChange={list.setPageSize}
          searchValue={list.searchInput}
          onSearchChange={list.setSearchInput}
        />
      </main>
    </>
  )
}
