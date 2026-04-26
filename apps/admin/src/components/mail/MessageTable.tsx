import { Link } from "@tanstack/react-router"
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"
import { useMemo } from "react"

import { DataTable } from "#/components/data-table/DataTable"
import { Badge } from "#/components/ui/badge"
import { useMailMessages } from "#/hooks/use-mail"
import type { MailMessage } from "#/lib/types/mail"
import * as m from "#/paraglide/messages.js"

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

function useColumns(): ColumnDef<MailMessage, unknown>[] {
  return useMemo(
    () => [
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
    ],
    [],
  ) as ColumnDef<MailMessage, unknown>[]
}

export function MessageTable() {
  const list = useMailMessages()
  const columns = useColumns()
  return (
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
  )
}
