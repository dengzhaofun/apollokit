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
import * as m from "#/paraglide/messages.js"
import type { BannerGroup } from "#/lib/types/banner"

interface GroupTableProps {
  data: BannerGroup[]
}

export function GroupTable({ data }: GroupTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{m.common_name()}</TableHead>
          <TableHead>{m.common_alias()}</TableHead>
          <TableHead>{m.banner_field_layout()}</TableHead>
          <TableHead>{m.common_status()}</TableHead>
          <TableHead>{m.common_updated()}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5} className="h-24 text-center">
              {m.banner_empty()}
            </TableCell>
          </TableRow>
        ) : (
          data.map((g) => (
            <TableRow key={g.id}>
              <TableCell>
                <Link
                  to="/banner/$groupId"
                  params={{ groupId: g.id }}
                  className="font-medium hover:underline"
                >
                  {g.name}
                </Link>
              </TableCell>
              <TableCell>
                {g.alias ? (
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                    {g.alias}
                  </code>
                ) : (
                  <Badge variant="outline">{m.banner_draft_badge()}</Badge>
                )}
              </TableCell>
              <TableCell>
                <Badge variant="secondary">
                  {g.layout === "carousel"
                    ? m.banner_layout_carousel()
                    : g.layout === "single"
                      ? m.banner_layout_single()
                      : m.banner_layout_grid()}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant={g.isActive ? "default" : "outline"}>
                  {g.isActive
                    ? m.banner_status_active()
                    : m.banner_status_inactive()}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {format(new Date(g.updatedAt), "yyyy-MM-dd HH:mm")}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )
}
