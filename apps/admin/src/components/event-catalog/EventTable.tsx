import { useTenantParams } from "#/hooks/use-tenant-params"
import { Link } from "@tanstack/react-router";
import { format } from "date-fns"

import { Badge } from "#/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import type {
  CatalogEventView,
  EventCapability,
  EventKind,
} from "#/lib/types/event-catalog"
import { cn } from "#/lib/utils"
import * as m from "#/paraglide/messages.js"

function kindBadge(kind: EventKind) {
  const label = kindLabel(kind)
  const className = kindClassName(kind)
  return (
    <Badge variant="outline" className={className}>
      {label}
    </Badge>
  )
}

function kindLabel(kind: EventKind): string {
  switch (kind) {
    case "internal-event":
      return m.event_catalog_kind_internal()
    case "external-event":
      return m.event_catalog_kind_external()
    case "http-request":
      return m.event_catalog_kind_http()
    case "platform-event":
      return m.event_catalog_kind_platform()
  }
}

/**
 * 按 kind 着色边框,让一眼能分清 4 类来源:
 *   - internal(代码注册): primary / 蓝
 *   - external(租户上报): amber / 黄
 *   - http-request(请求日志): purple / 紫
 *   - platform-event(平台信号): emerald / 绿
 */
function kindClassName(kind: EventKind): string {
  switch (kind) {
    case "internal-event":
      return "border-sky-500/40 text-sky-700 dark:text-sky-400"
    case "external-event":
      return "border-amber-500/40 text-amber-700 dark:text-amber-400"
    case "http-request":
      return "border-purple-500/40 text-purple-700 dark:text-purple-400"
    case "platform-event":
      return "border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
  }
}

function capabilityChip(cap: EventCapability) {
  const label =
    cap === "task-trigger"
      ? m.event_catalog_capability_task_trigger()
      : m.event_catalog_capability_analytics()
  const cls =
    cap === "task-trigger"
      ? "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30"
      : "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30"
  return (
    <Badge
      key={cap}
      variant="outline"
      className={cn("text-[10px] font-normal", cls)}
    >
      {label}
    </Badge>
  )
}

function statusBadge(view: CatalogEventView) {
  // 只有 external 才有 inferred / canonical 状态
  if (view.kind !== "external-event") return <span className="text-muted-foreground">—</span>
  if (view.status === "canonical") {
    return <Badge variant="default">{m.event_catalog_status_canonical()}</Badge>
  }
  return <Badge variant="outline">{m.event_catalog_status_inferred()}</Badge>
}

interface EventTableProps {
  data: CatalogEventView[]
}

export function EventTable({ data }: EventTableProps) {
  const { orgSlug, projectSlug } = useTenantParams()
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{m.event_catalog_field_name()}</TableHead>
          <TableHead>{m.event_catalog_field_kind()}</TableHead>
          <TableHead>{m.event_catalog_field_capabilities()}</TableHead>
          <TableHead>{m.event_catalog_field_owner()}</TableHead>
          <TableHead>{m.event_catalog_field_status()}</TableHead>
          <TableHead>{m.event_catalog_field_field_count()}</TableHead>
          <TableHead>{m.event_catalog_field_last_seen()}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.length === 0 ? (
          <TableRow>
            <TableCell colSpan={7} className="h-24 text-center">
              {m.event_catalog_empty()}
            </TableCell>
          </TableRow>
        ) : (
          data.map((v) => (
            <TableRow key={v.name}>
              <TableCell>
                {v.kind === "external-event" ? (
                  <Link
                    to="/o/$orgSlug/p/$projectSlug/event-catalog/$name"
                    params={{ orgSlug, projectSlug, name: v.name }}
                    className="font-mono text-sm hover:underline"
                  >
                    {v.name}
                  </Link>
                ) : (
                  // internal / platform / http-request 不能编辑,不放链接
                  <span className="font-mono text-sm text-muted-foreground">
                    {v.name}
                  </span>
                )}
              </TableCell>
              <TableCell>{kindBadge(v.kind)}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {v.capabilities.map(capabilityChip)}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {v.owner ?? "—"}
              </TableCell>
              <TableCell>{statusBadge(v)}</TableCell>
              <TableCell className="text-muted-foreground">
                {v.fields.length}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {v.lastSeenAt
                  ? format(new Date(v.lastSeenAt), "yyyy-MM-dd HH:mm")
                  : m.event_catalog_never_seen()}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )
}
