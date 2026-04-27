/**
 * Self-contained audit-log list table —— 与 EndUserTable 同构造，复用
 * `useListSearch + DataTable` 骨架。
 *
 * 详情通过右侧 Sheet（`AuditLogDetailSheet`）渲染，不跳走另一条路由 ——
 * 审计行没有"独立编辑页"语义，单页内 peek 即可。
 */
import type { ColumnDef } from "@tanstack/react-table"
import { useMemo, useState } from "react"
import { Bot, KeyRound, ShieldAlert, User as UserIcon } from "lucide-react"

import { Badge } from "#/components/ui/badge"
import { DataTable } from "#/components/data-table/DataTable"
import {
  AUDIT_LOG_FILTER_DEFS_BASE,
  useAuditLogResourceTypes,
  useAuditLogs,
  withResourceTypeOptions,
} from "#/hooks/use-audit-logs"
import type { AuditLog } from "#/lib/types/audit-log"

import { AuditLogDetailSheet } from "./AuditLogDetailSheet"

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  // Local-time, sortable; second precision is enough for an audit row.
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function ActorBadge({ row }: { row: AuditLog }) {
  if (row.actorType === "user") {
    return (
      <Badge variant="secondary" className="gap-1">
        <UserIcon className="size-3" />
        {row.actorLabel ?? row.actorId ?? "user"}
      </Badge>
    )
  }
  if (row.actorType === "admin-api-key") {
    return (
      <Badge variant="outline" className="gap-1">
        <KeyRound className="size-3" />
        API key
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="gap-1">
      <Bot className="size-3" />
      {row.actorType}
    </Badge>
  )
}

function ActionBadge({ action }: { action: string }) {
  const variant: React.ComponentProps<typeof Badge>["variant"] =
    action === "delete"
      ? "destructive"
      : action === "create"
        ? "default"
        : "secondary"
  return <Badge variant={variant}>{action}</Badge>
}

function StatusBadge({ status }: { status: number }) {
  if (status >= 500) {
    return (
      <Badge variant="destructive" className="gap-1 tabular-nums">
        <ShieldAlert className="size-3" />
        {status}
      </Badge>
    )
  }
  if (status >= 400) {
    return (
      <Badge variant="outline" className="tabular-nums">
        {status}
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className="tabular-nums">
      {status}
    </Badge>
  )
}

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  route: any
  toolbar?: React.ReactNode
}

export function AuditLogTable({ route, toolbar }: Props) {
  // 资源类型动态选项 —— 失败时退化为空列表，UI 只是少了 select preset。
  const { data: rtData } = useAuditLogResourceTypes()
  const filterDefs = useMemo(
    () =>
      withResourceTypeOptions(
        AUDIT_LOG_FILTER_DEFS_BASE,
        rtData?.items ?? [],
      ),
    [rtData],
  )

  const list = useAuditLogs(route, filterDefs)

  const [openId, setOpenId] = useState<string | null>(null)

  const columns: ColumnDef<AuditLog>[] = useMemo(
    () => [
      {
        accessorKey: "ts",
        header: "Time",
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => setOpenId(row.original.id)}
            className="text-left font-medium tabular-nums hover:underline"
          >
            {formatDateTime(row.original.ts)}
          </button>
        ),
      },
      {
        accessorKey: "actorLabel",
        header: "Actor",
        cell: ({ row }) => <ActorBadge row={row.original} />,
      },
      {
        accessorKey: "action",
        header: "Action",
        cell: ({ row }) => <ActionBadge action={row.original.action} />,
      },
      {
        accessorKey: "resourceType",
        header: "Resource",
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">{row.original.resourceType}</span>
            {row.original.resourceLabel ? (
              <span className="text-xs text-muted-foreground">
                {row.original.resourceLabel}
              </span>
            ) : row.original.resourceId ? (
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                {row.original.resourceId}
              </code>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "method",
        header: "Method",
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.method}</span>
        ),
      },
      {
        accessorKey: "path",
        header: "Path",
        cell: ({ row }) => (
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
            {row.original.path}
          </code>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
    ],
    [],
  )

  return (
    <>
      <DataTable
        columns={columns}
        data={list.items}
        toolbar={toolbar}
        getRowId={(r) => r.id}
        filters={filterDefs}
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
      <AuditLogDetailSheet
        id={openId}
        open={!!openId}
        onOpenChange={(open) => !open && setOpenId(null)}
      />
    </>
  )
}
