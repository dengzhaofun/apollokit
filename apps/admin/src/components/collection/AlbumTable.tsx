import { Link } from "#/components/router-helpers"
import { format } from "date-fns"

import {
  RowMoveActions,
  SortableTableProvider,
  SortableTableRow,
} from "#/components/common/SortableTable"
import { Badge } from "#/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import { useMoveCollectionAlbum } from "#/hooks/use-move"
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
  const moveMutation = useMoveCollectionAlbum()

  return (
    <SortableTableProvider
      items={data}
      onMove={(id, body) => moveMutation.mutate({ id, body })}
      disabled={moveMutation.isPending}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead>{m.common_name()}</TableHead>
            <TableHead>{m.common_alias()}</TableHead>
            <TableHead>{m.collection_field_scope()}</TableHead>
            <TableHead>{m.common_status()}</TableHead>
            <TableHead>{m.common_updated()}</TableHead>
            <TableHead className="w-40 text-right">
              {m.data_table_reorder_actions()}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="h-24 text-center">
                {m.collection_empty()}
              </TableCell>
            </TableRow>
          ) : (
            data.map((a, idx) => (
              <SortableTableRow key={a.id} id={a.id}>
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
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-0.5">
                    <RowMoveActions
                      id={a.id}
                      prevId={data[idx - 1]?.id}
                      nextId={data[idx + 1]?.id}
                      isFirst={idx === 0}
                      isLast={idx === data.length - 1}
                    />
                  </div>
                </TableCell>
              </SortableTableRow>
            ))
          )}
        </TableBody>
      </Table>
    </SortableTableProvider>
  )
}
