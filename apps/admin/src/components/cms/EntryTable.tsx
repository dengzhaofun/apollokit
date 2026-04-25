/**
 * Entry list — minimal table with status badge, group, tags, updated time.
 *
 * Clicking a row navigates to the entry edit page. Filtering /
 * pagination is handled by the parent route via TanStack Query params.
 */

import { Link } from "@tanstack/react-router"

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
import type { CmsEntry, CmsEntryStatus } from "#/lib/types/cms"

const STATUS_VARIANT: Record<
  CmsEntryStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  draft: "outline",
  published: "default",
  archived: "secondary",
}

export function EntryTable({
  typeAlias,
  data,
}: {
  typeAlias: string
  data: CmsEntry[]
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        {m.cms_entry_list_empty()}
      </div>
    )
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{m.common_alias()}</TableHead>
          <TableHead>{m.common_status()}</TableHead>
          <TableHead>{m.cms_entry_group()}</TableHead>
          <TableHead>{m.cms_entry_tags()}</TableHead>
          <TableHead>{m.common_updated()}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((e) => (
          <TableRow key={e.id} className="hover:bg-muted/50">
            <TableCell>
              <Link
                to="/cms/$typeAlias/$entryAlias"
                params={{ typeAlias, entryAlias: e.alias }}
                className="font-medium underline-offset-4 hover:underline"
              >
                {e.alias}
              </Link>
            </TableCell>
            <TableCell>
              <Badge variant={STATUS_VARIANT[e.status]}>{e.status}</Badge>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {e.groupKey ?? "—"}
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                {e.tags.length === 0 ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  e.tags.map((t) => (
                    <Badge key={t} variant="outline" className="text-xs">
                      {t}
                    </Badge>
                  ))
                )}
              </div>
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {new Date(e.updatedAt).toLocaleString()}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
