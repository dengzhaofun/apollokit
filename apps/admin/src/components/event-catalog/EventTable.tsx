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
import type { CatalogEventView } from "#/lib/types/event-catalog"
import * as m from "#/paraglide/messages.js"

function statusBadge(view: CatalogEventView) {
  if (view.source === "internal") {
    return (
      <Badge variant="secondary">{m.event_catalog_source_internal()}</Badge>
    )
  }
  if (view.status === "canonical") {
    return <Badge variant="default">{m.event_catalog_status_canonical()}</Badge>
  }
  return <Badge variant="outline">{m.event_catalog_status_inferred()}</Badge>
}

interface EventTableProps {
  data: CatalogEventView[]
}

export function EventTable({ data }: EventTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{m.event_catalog_field_name()}</TableHead>
          <TableHead>{m.event_catalog_field_owner()}</TableHead>
          <TableHead>{m.event_catalog_field_status()}</TableHead>
          <TableHead>{m.event_catalog_field_field_count()}</TableHead>
          <TableHead>{m.event_catalog_field_last_seen()}</TableHead>
          <TableHead>{m.event_catalog_field_forwards()}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.length === 0 ? (
          <TableRow>
            <TableCell colSpan={6} className="h-24 text-center">
              {m.event_catalog_empty()}
            </TableCell>
          </TableRow>
        ) : (
          data.map((v) => (
            <TableRow key={v.name}>
              <TableCell>
                <Link
                  to="/event-catalog/$name"
                  params={{ name: v.name }}
                  className="font-mono text-sm hover:underline"
                >
                  {v.name}
                </Link>
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
              <TableCell>
                {v.forwardToTask ? (
                  <Badge variant="secondary">
                    {m.event_catalog_forwards_yes()}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">
                    {m.event_catalog_forwards_no()}
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )
}
