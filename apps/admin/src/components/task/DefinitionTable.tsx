import { useMoveTaskDefinition } from "#/hooks/use-move"
import { Link } from "@tanstack/react-router"
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"
import { MoreHorizontal, Pencil } from "lucide-react"
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
import { useQuery, type QueryKey } from "@tanstack/react-query"
import { api } from "#/lib/api-client"
import {
  qs as buildQs,
  type Page,
} from "#/hooks/use-list-search"
import type { TaskDefinition } from "#/lib/types/task"
import * as m from "#/paraglide/messages.js"

const columnHelper = createColumnHelper<TaskDefinition>()

function ActionsCell({ def }: { def: TaskDefinition }) {

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" className="size-8">
            <MoreHorizontal className="size-4" />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          render={
            <Link to="/task/$taskId" params={{ taskId: def.id }}>
              <Pencil className="mr-2 size-4" />
              {m.common_edit()}
            </Link>
          }
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function useColumns(): ColumnDef<TaskDefinition, unknown>[] {
  return useMemo(
    () => [
      columnHelper.accessor("name", {
        header: () => m.common_name(),
        cell: (info) => (
          <Link
            to="/task/$taskId"
            params={{ taskId: info.row.original.id }}
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
            <span className="text-muted-foreground">—</span>
          )
        },
      }),
      columnHelper.accessor("period", {
        header: () => "Period",
        cell: (info) => <Badge variant="outline">{info.getValue()}</Badge>,
      }),
      columnHelper.accessor("countingMethod", {
        header: () => "Method",
        cell: (info) => {
          const v = info.getValue()
          return v === "event_count"
            ? "Count"
            : v === "event_value"
              ? "Value"
              : "Children"
        },
      }),
      columnHelper.accessor("targetValue", {
        header: () => "Target",
        cell: (info) => info.getValue(),
      }),
      columnHelper.accessor("isActive", {
        header: () => m.common_status(),
        cell: (info) => (
          <Badge variant={info.getValue() ? "default" : "outline"}>
            {info.getValue() ? m.common_active() : m.common_inactive()}
          </Badge>
        ),
      }),
      columnHelper.accessor("createdAt", {
        header: () => m.common_created(),
        cell: (info) => format(new Date(info.getValue()), "yyyy-MM-dd"),
      }),
      columnHelper.display({
        id: "actions",
        header: "",
        cell: (info) => <ActionsCell def={info.row.original} />,
      }),
    ],
    [],
  ) as ColumnDef<TaskDefinition, unknown>[]
}

interface Props {
  categoryId?: string
  activityId?: string
  includeActivity?: boolean
}

/**
 * Per-tab task-definitions table.
 *
 * The task index page renders this table inside multiple tabs (one
 * per category) on a single route. URL-driven pagination/search would
 * collide across tabs (the active tab's filter would clobber the
 * others on remount). We deliberately keep this table on a plain
 * `useQuery` (no cursor stack, no URL state) so each tab is fully
 * independent — at the cost of "refresh remembers page state" on
 * this page only. Migrating to URL state requires a route restructure
 * (one route per category, or scoped URL keys per tab) and is tracked
 * as a follow-up.
 */
export function DefinitionTable({
  categoryId,
  activityId,
  includeActivity,
}: Props = {}) {
  const queryKey: QueryKey = [
    "task-definitions",
    {
      categoryId: categoryId ?? null,
      activityId: activityId ?? null,
      includeActivity: !!includeActivity,
    },
  ]
  const query = useQuery({
    queryKey,
    queryFn: () =>
      api.get<Page<TaskDefinition>>(
        `/api/v1/task/definitions?${buildQs({
          limit: 50,
          categoryId,
          activityId,
          includeActivity: includeActivity ? "true" : undefined,
        })}`,
      ),
  })
  const columns = useColumns()
  const items = query.data?.items ?? []
  const moveMutation = useMoveTaskDefinition()
  return (
    <DataTable
      columns={columns}
      mobileLayout="cards"
      data={items}
      getRowId={(row) => row.id}
      pageIndex={1}
      canPrev={false}
      canNext={!!query.data?.nextCursor}
      onNextPage={() => {}}
      onPrevPage={() => {}}
      pageSize={50}
      onPageSizeChange={() => {}}
      isLoading={query.isPending}
      showSearch={false}
      sortable={{
        onMove: (id, body) => moveMutation.mutate({ id, body }),
        disabled: moveMutation.isPending,
      }}
    />
  )
}
