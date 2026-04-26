import { Link } from "@tanstack/react-router"
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
import { openEditModal } from "#/lib/modal-search"
import * as m from "#/paraglide/messages.js"
import type {
  Announcement,
  AnnouncementKind,
  AnnouncementSeverity,
} from "#/lib/types/announcement"

interface AnnouncementTableProps {
  data: Announcement[]
}

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

export function AnnouncementTable({ data }: AnnouncementTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{m.announcement_col_alias_title()}</TableHead>
          <TableHead>{m.announcement_col_kind()}</TableHead>
          <TableHead>{m.announcement_col_severity()}</TableHead>
          <TableHead>{m.announcement_col_window()}</TableHead>
          <TableHead>{m.announcement_col_priority()}</TableHead>
          <TableHead>{m.announcement_col_status()}</TableHead>
          <TableHead>{m.announcement_col_updated()}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.length === 0 ? (
          <TableRow>
            <TableCell colSpan={7} className="h-24 text-center">
              {m.announcement_empty()}
            </TableCell>
          </TableRow>
        ) : (
          data.map((a) => (
            <TableRow key={a.id}>
              <TableCell>
                <Link
                  to="/announcement"
                  search={(prev) => ({ ...prev, ...openEditModal(a.alias) })}
                  className="block"
                >
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                    {a.alias}
                  </code>
                  <div className="mt-1 font-medium hover:underline">
                    {a.title}
                  </div>
                </Link>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{kindLabel(a.kind)}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant={SEVERITY_VARIANT[a.severity]}>
                  {severityLabel(a.severity)}
                </Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {formatWindow(a.visibleFrom, a.visibleUntil)}
              </TableCell>
              <TableCell className="text-center">{a.priority}</TableCell>
              <TableCell>
                <Badge variant={a.isActive ? "default" : "outline"}>
                  {a.isActive
                    ? m.announcement_status_active()
                    : m.announcement_status_inactive()}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {format(new Date(a.updatedAt), "yyyy-MM-dd HH:mm")}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )
}
