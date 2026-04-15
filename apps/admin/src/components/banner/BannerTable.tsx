import { Link } from "@tanstack/react-router"
import { ArrowDown, ArrowUp, ExternalLink, Pencil, Trash2 } from "lucide-react"
import { format } from "date-fns"

import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import * as m from "#/paraglide/messages.js"
import type { Banner } from "#/lib/types/banner"
import { describeLinkAction } from "#/lib/types/link"

interface BannerTableProps {
  data: Banner[]
  groupId: string
  onMove: (bannerId: string, direction: "up" | "down") => void
  onDelete: (bannerId: string) => void
  isBusy?: boolean
}

function visibilityLabel(row: Banner): string {
  const parts: string[] = []
  if (row.visibleFrom)
    parts.push(format(new Date(row.visibleFrom), "MM-dd HH:mm"))
  parts.push("→")
  if (row.visibleUntil)
    parts.push(format(new Date(row.visibleUntil), "MM-dd HH:mm"))
  else parts.push("∞")
  if (!row.visibleFrom && !row.visibleUntil) return "—"
  return parts.join(" ")
}

export function BannerTable({
  data,
  groupId,
  onMove,
  onDelete,
  isBusy,
}: BannerTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-28">{m.banner_col_preview()}</TableHead>
          <TableHead>{m.banner_col_title()}</TableHead>
          <TableHead>{m.banner_col_visibility()}</TableHead>
          <TableHead>{m.banner_col_target()}</TableHead>
          <TableHead>{m.banner_col_link()}</TableHead>
          <TableHead>{m.banner_col_status()}</TableHead>
          <TableHead className="w-32 text-right">
            {m.banner_col_actions()}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.length === 0 ? (
          <TableRow>
            <TableCell colSpan={7} className="h-24 text-center">
              {m.banner_banners_empty()}
            </TableCell>
          </TableRow>
        ) : (
          data.map((row, index) => {
            const linkDesc = describeLinkAction(row.linkAction)
            const isExternal = row.linkAction.type === "external"
            return (
              <TableRow key={row.id}>
                <TableCell>
                  {row.imageUrlMobile ? (
                    <img
                      src={row.imageUrlMobile}
                      alt={row.altText ?? row.title}
                      className="h-10 w-20 rounded object-cover"
                    />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="font-medium">{row.title}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {visibilityLabel(row)}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {row.targetType === "broadcast"
                      ? m.banner_target_broadcast()
                      : m.banner_target_multicast()}
                    {row.targetType === "multicast" &&
                    row.targetUserIds?.length
                      ? ` · ${row.targetUserIds.length}`
                      : null}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-[220px] truncate">
                  {isExternal ? (
                    <a
                      href={
                        row.linkAction.type === "external"
                          ? row.linkAction.url
                          : "#"
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sm hover:underline"
                    >
                      <span className="truncate">{linkDesc}</span>
                      <ExternalLink className="size-3 shrink-0" />
                    </a>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {linkDesc}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={row.isActive ? "default" : "outline"}>
                    {row.isActive
                      ? m.banner_status_active()
                      : m.banner_status_inactive()}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      disabled={isBusy || index === 0}
                      title={m.banner_move_up()}
                      onClick={() => onMove(row.id, "up")}
                    >
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      disabled={isBusy || index === data.length - 1}
                      title={m.banner_move_down()}
                      onClick={() => onMove(row.id, "down")}
                    >
                      <ArrowDown className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      asChild
                    >
                      <Link
                        to="/banner/$groupId/banners/$bannerId"
                        params={{ groupId, bannerId: row.id }}
                        title={m.common_edit()}
                      >
                        <Pencil className="size-4" />
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive"
                      disabled={isBusy}
                      title={m.common_delete()}
                      onClick={() => onDelete(row.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )
          })
        )}
      </TableBody>
    </Table>
  )
}
