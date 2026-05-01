import { Link } from "@tanstack/react-router"
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
import { useMoveEntityBlueprint } from "#/hooks/use-move"
import * as m from "#/paraglide/messages.js"
import type { EntityBlueprint } from "#/lib/types/entity"

interface BlueprintTableProps {
  data: EntityBlueprint[]
  schemaId: string
}

export function BlueprintTable({ data, schemaId }: BlueprintTableProps) {
  const moveMutation = useMoveEntityBlueprint()

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
            <TableHead>{m.entity_rarity()}</TableHead>
            <TableHead>{m.entity_tags()}</TableHead>
            <TableHead>{m.entity_base_stats()}</TableHead>
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
              <TableCell colSpan={9} className="h-24 text-center">
                {m.entity_no_blueprints()}
              </TableCell>
            </TableRow>
          ) : (
            data.map((bp, idx) => (
              <SortableTableRow key={bp.id} id={bp.id}>
                <TableCell>
                  <Link
                    to="/entity/schemas/$schemaId/blueprints/$blueprintId"
                    params={{ schemaId, blueprintId: bp.id }}
                    className="font-medium hover:underline"
                  >
                    {bp.name}
                  </Link>
                </TableCell>
                <TableCell>
                  {bp.alias ? (
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                      {bp.alias}
                    </code>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {bp.rarity ? (
                    <Badge variant="secondary">{bp.rarity}</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(bp.tags).map(([k, v]) => (
                      <Badge key={k} variant="outline" className="text-xs">
                        {k}:{v}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(bp.baseStats)
                      .slice(0, 3)
                      .map(([k, v]) => (
                        <Badge key={k} variant="secondary" className="text-xs">
                          {k}: {v}
                        </Badge>
                      ))}
                    {Object.keys(bp.baseStats).length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{Object.keys(bp.baseStats).length - 3}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={bp.isActive ? "default" : "outline"}>
                    {bp.isActive ? m.common_active() : m.common_inactive()}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {format(new Date(bp.updatedAt), "yyyy-MM-dd")}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-0.5">
                    <RowMoveActions
                      id={bp.id}
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
