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
import type { RankTierConfig } from "#/lib/types/rank"
import * as m from "#/paraglide/messages.js"

interface Props {
  data: RankTierConfig[]
}

export function TierConfigTable({ data }: Props) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{m.rank_col_alias()}</TableHead>
          <TableHead>{m.rank_col_name()}</TableHead>
          <TableHead className="text-center">{m.rank_col_tiers()}</TableHead>
          <TableHead className="text-center">{m.rank_col_version()}</TableHead>
          <TableHead>{m.rank_col_active()}</TableHead>
          <TableHead>{m.rank_col_updated()}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={6}
              className="h-24 text-center text-muted-foreground"
            >
              {m.rank_no_configs()}
            </TableCell>
          </TableRow>
        ) : (
          data.map((c) => (
            <TableRow key={c.id}>
              <TableCell>
                <Link
                  to="/rank/$configId"
                  params={{ configId: c.id }}
                  className="block"
                >
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                    {c.alias}
                  </code>
                </Link>
              </TableCell>
              <TableCell className="font-medium">{c.name}</TableCell>
              <TableCell className="text-center">{c.tiers.length}</TableCell>
              <TableCell className="text-center text-muted-foreground">
                v{c.version}
              </TableCell>
              <TableCell>
                <Badge variant={c.isActive ? "default" : "outline"}>
                  {c.isActive
                    ? m.rank_season_status_active()
                    : m.rank_season_status_upcoming()}
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
