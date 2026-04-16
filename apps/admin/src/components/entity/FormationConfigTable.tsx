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
import type { EntityFormationConfig } from "#/lib/types/entity"

interface FormationConfigTableProps {
  data: EntityFormationConfig[]
}

export function FormationConfigTable({ data }: FormationConfigTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{m.common_name()}</TableHead>
          <TableHead>{m.common_alias()}</TableHead>
          <TableHead>{m.entity_max_formations()}</TableHead>
          <TableHead>{m.entity_max_slots()}</TableHead>
          <TableHead>{m.entity_allow_duplicate_blueprints()}</TableHead>
          <TableHead>{m.common_updated()}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.length === 0 ? (
          <TableRow>
            <TableCell colSpan={6} className="h-24 text-center">
              {m.entity_no_formations()}
            </TableCell>
          </TableRow>
        ) : (
          data.map((fc) => (
            <TableRow key={fc.id}>
              <TableCell className="font-medium">{fc.name}</TableCell>
              <TableCell>
                {fc.alias ? (
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                    {fc.alias}
                  </code>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>{fc.maxFormations}</TableCell>
              <TableCell>{fc.maxSlots}</TableCell>
              <TableCell>
                <Badge variant={fc.allowDuplicateBlueprints ? "default" : "outline"}>
                  {fc.allowDuplicateBlueprints ? m.common_yes() : m.common_no()}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {format(new Date(fc.updatedAt), "yyyy-MM-dd")}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )
}
