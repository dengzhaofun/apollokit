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
import type { DialogueScript } from "#/lib/types/dialogue"

interface ScriptTableProps {
  data: DialogueScript[]
}

export function ScriptTable({ data }: ScriptTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{m.dialogue_col_name()}</TableHead>
          <TableHead>{m.dialogue_col_alias()}</TableHead>
          <TableHead>{m.dialogue_col_nodes()}</TableHead>
          <TableHead>{m.dialogue_col_repeatable()}</TableHead>
          <TableHead>{m.dialogue_col_status()}</TableHead>
          <TableHead>{m.common_updated()}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.length === 0 ? (
          <TableRow>
            <TableCell colSpan={6} className="h-24 text-center">
              {m.dialogue_empty()}
            </TableCell>
          </TableRow>
        ) : (
          data.map((s) => (
            <TableRow key={s.id}>
              <TableCell>
                <Link
                  to="/dialogue/$scriptId"
                  params={{ scriptId: s.id }}
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
                  <Badge variant="outline">{m.dialogue_draft_badge()}</Badge>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {s.nodes.length}
              </TableCell>
              <TableCell>
                {s.repeatable ? (
                  <Badge variant="secondary">✓</Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                <Badge variant={s.isActive ? "default" : "outline"}>
                  {s.isActive ? m.common_active() : m.common_inactive()}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {format(new Date(s.updatedAt), "yyyy-MM-dd HH:mm")}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )
}
