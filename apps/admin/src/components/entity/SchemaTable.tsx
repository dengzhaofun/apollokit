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
import type { EntitySchema } from "#/lib/types/entity"

interface SchemaTableProps {
  data: EntitySchema[]
}

export function SchemaTable({ data }: SchemaTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{m.common_name()}</TableHead>
          <TableHead>{m.common_alias()}</TableHead>
          <TableHead>{m.entity_stat_definitions()}</TableHead>
          <TableHead>{m.entity_slot_definitions()}</TableHead>
          <TableHead>{m.entity_level_config()}</TableHead>
          <TableHead>{m.entity_rank_config()}</TableHead>
          <TableHead>{m.common_status()}</TableHead>
          <TableHead>{m.common_updated()}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.length === 0 ? (
          <TableRow>
            <TableCell colSpan={8} className="h-24 text-center">
              {m.entity_no_schemas()}
            </TableCell>
          </TableRow>
        ) : (
          data.map((s) => (
            <TableRow key={s.id}>
              <TableCell>
                <Link
                  to="/entity/schemas/$schemaId"
                  params={{ schemaId: s.id }}
                  className="font-medium hover:underline"
                >
                  {s.name}
                </Link>
              </TableCell>
              <TableCell>
                {s.alias ? (
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                    {s.alias}
                  </code>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                <Badge variant="secondary">
                  {s.statDefinitions.length}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant="secondary">
                  {s.slotDefinitions.length}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant={s.levelConfig.enabled ? "default" : "outline"}>
                  {s.levelConfig.enabled
                    ? `Lv.${s.levelConfig.maxLevel}`
                    : m.entity_disabled()}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant={s.rankConfig.enabled ? "default" : "outline"}>
                  {s.rankConfig.enabled
                    ? `${s.rankConfig.ranks.length}`
                    : m.entity_disabled()}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant={s.isActive ? "default" : "outline"}>
                  {s.isActive ? m.common_active() : m.common_inactive()}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {format(new Date(s.updatedAt), "yyyy-MM-dd")}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )
}
