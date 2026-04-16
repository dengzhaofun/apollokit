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
import type { EntityBlueprintSkin } from "#/lib/types/entity"

interface SkinTableProps {
  data: EntityBlueprintSkin[]
}

export function SkinTable({ data }: SkinTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{m.common_name()}</TableHead>
          <TableHead>{m.common_alias()}</TableHead>
          <TableHead>{m.entity_rarity()}</TableHead>
          <TableHead>{m.entity_stat_bonuses()}</TableHead>
          <TableHead>{m.entity_is_default()}</TableHead>
          <TableHead>{m.common_status()}</TableHead>
          <TableHead>{m.common_updated()}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.length === 0 ? (
          <TableRow>
            <TableCell colSpan={7} className="h-24 text-center">
              {m.entity_no_skins()}
            </TableCell>
          </TableRow>
        ) : (
          data.map((skin) => (
            <TableRow key={skin.id}>
              <TableCell className="font-medium">{skin.name}</TableCell>
              <TableCell>
                {skin.alias ? (
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                    {skin.alias}
                  </code>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                {skin.rarity ? (
                  <Badge variant="secondary">{skin.rarity}</Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(skin.statBonuses).map(([k, v]) => (
                    <Badge key={k} variant="outline" className="text-xs">
                      {k}: +{v}
                    </Badge>
                  ))}
                  {Object.keys(skin.statBonuses).length === 0 && (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                {skin.isDefault && <Badge>Default</Badge>}
              </TableCell>
              <TableCell>
                <Badge variant={skin.isActive ? "default" : "outline"}>
                  {skin.isActive ? m.common_active() : m.common_inactive()}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {format(new Date(skin.updatedAt), "yyyy-MM-dd")}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )
}
