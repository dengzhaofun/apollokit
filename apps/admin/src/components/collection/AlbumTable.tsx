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
import type { CollectionAlbum } from "#/lib/types/collection"

function scopeLabel(scope: string): string {
  switch (scope) {
    case "hero":
      return m.collection_scope_hero()
    case "monster":
      return m.collection_scope_monster()
    case "equipment":
      return m.collection_scope_equipment()
    default:
      return m.collection_scope_custom()
  }
}

interface AlbumTableProps {
  data: CollectionAlbum[]
}

export function AlbumTable({ data }: AlbumTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{m.common_name()}</TableHead>
          <TableHead>{m.common_alias()}</TableHead>
          <TableHead>{m.collection_field_scope()}</TableHead>
          <TableHead>{m.common_status()}</TableHead>
          <TableHead>{m.common_updated()}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5} className="h-24 text-center">
              {m.collection_empty()}
            </TableCell>
          </TableRow>
        ) : (
          data.map((a) => (
            <TableRow key={a.id}>
              <TableCell>
                <Link
                  to="/collection/$albumId"
                  params={{ albumId: a.id }}
                  className="font-medium hover:underline"
                >
                  {a.name}
                </Link>
              </TableCell>
              <TableCell>
                {a.alias ? (
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                    {a.alias}
                  </code>
                ) : (
                  <Badge variant="outline">
                    {m.collection_draft_badge()}
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{scopeLabel(a.scope)}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant={a.isActive ? "default" : "outline"}>
                  {a.isActive
                    ? m.collection_status_active()
                    : m.collection_status_inactive()}
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
