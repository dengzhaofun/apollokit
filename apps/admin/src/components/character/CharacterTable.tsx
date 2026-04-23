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
import { resolveAssetUrl } from "#/lib/api-client"
import type { Character } from "#/lib/types/character"
import * as m from "#/paraglide/messages.js"

interface CharacterTableProps {
  data: Character[]
}

export function CharacterTable({ data }: CharacterTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-14">{m.character_col_avatar()}</TableHead>
          <TableHead>{m.character_col_name()}</TableHead>
          <TableHead>{m.character_col_alias()}</TableHead>
          <TableHead>{m.character_col_default_side()}</TableHead>
          <TableHead>{m.character_col_status()}</TableHead>
          <TableHead>{m.common_updated()}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.length === 0 ? (
          <TableRow>
            <TableCell colSpan={6} className="h-24 text-center">
              {m.character_empty()}
            </TableCell>
          </TableRow>
        ) : (
          data.map((c) => (
            <TableRow key={c.id}>
              <TableCell>
                {c.avatarUrl ? (
                  <img
                    src={resolveAssetUrl(c.avatarUrl)}
                    alt=""
                    className="size-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="size-8 rounded-full bg-muted" />
                )}
              </TableCell>
              <TableCell>
                <Link
                  to="/character/$characterId"
                  params={{ characterId: c.id }}
                  className="font-medium hover:underline"
                >
                  {c.name}
                </Link>
              </TableCell>
              <TableCell>
                {c.alias ? (
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                    {c.alias}
                  </code>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                {c.defaultSide === "left"
                  ? m.character_side_left()
                  : c.defaultSide === "right"
                    ? m.character_side_right()
                    : <span className="text-muted-foreground">—</span>}
              </TableCell>
              <TableCell>
                <Badge variant={c.isActive ? "default" : "outline"}>
                  {c.isActive ? m.common_active() : m.common_inactive()}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {format(new Date(c.updatedAt), "yyyy-MM-dd HH:mm")}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )
}
