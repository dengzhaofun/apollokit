import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { Link } from "@tanstack/react-router"
import { format } from "date-fns"

import * as m from "#/paraglide/messages.js"
import { Badge } from "#/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import type { MailMessage } from "#/lib/types/mail"

type Status = "revoked" | "expired" | "active"

function statusOf(row: MailMessage, now: number): Status {
  if (row.revokedAt) return "revoked"
  if (row.expiresAt && new Date(row.expiresAt).getTime() <= now) return "expired"
  return "active"
}

function statusLabel(s: Status): string {
  if (s === "revoked") return m.mail_status_revoked()
  if (s === "expired") return m.mail_status_expired()
  return m.mail_status_active()
}

function statusVariant(s: Status): "default" | "outline" | "secondary" {
  if (s === "revoked") return "outline"
  if (s === "expired") return "secondary"
  return "default"
}

const columnHelper = createColumnHelper<MailMessage>()

const columns = [
  columnHelper.accessor("title", {
    header: () => m.mail_col_title(),
    cell: (info) => (
      <Link
        to="/mail/$messageId"
        params={{ messageId: info.row.original.id }}
        className="font-medium hover:underline"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("targetType", {
    header: () => m.mail_col_target(),
    cell: (info) => {
      const t = info.getValue()
      const isUnicast =
        t === "multicast" &&
        (info.row.original.targetUserIds?.length ?? 0) === 1
      return (
        <Badge variant="secondary">
          {isUnicast
            ? m.mail_target_unicast()
            : t === "broadcast"
              ? m.mail_target_broadcast()
              : m.mail_target_multicast()}
        </Badge>
      )
    },
  }),
  columnHelper.display({
    id: "recipients",
    header: () => m.mail_col_recipients(),
    cell: (info) => {
      const r = info.row.original
      if (r.targetType === "broadcast") {
        return <span className="text-muted-foreground">{m.mail_all_users()}</span>
      }
      return <span>{r.targetUserIds?.length ?? 0}</span>
    },
  }),
  columnHelper.accessor("requireRead", {
    header: () => m.mail_col_require_read(),
    cell: (info) =>
      info.getValue() ? (
        <Badge variant="outline">{m.mail_require_read_yes()}</Badge>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  }),
  columnHelper.display({
    id: "status",
    header: () => m.common_status(),
    cell: (info) => {
      const s = statusOf(info.row.original, Date.now())
      return <Badge variant={statusVariant(s)}>{statusLabel(s)}</Badge>
    },
  }),
  columnHelper.accessor("sentAt", {
    header: () => m.mail_col_sent_at(),
    cell: (info) => format(new Date(info.getValue()), "yyyy-MM-dd HH:mm"),
  }),
]

interface MessageTableProps {
  data: MailMessage[]
}

export function MessageTable({ data }: MessageTableProps) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <TableHead key={header.id}>
                {header.isPlaceholder
                  ? null
                  : flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.length ? (
          table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={columns.length} className="h-24 text-center">
              {m.mail_empty()}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
