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
import type { CollectionAlbum } from "#/lib/types/collection"

const SCOPE_LABELS: Record<string, string> = {
  hero: "英雄",
  monster: "怪物",
  equipment: "装备",
  custom: "自定义",
}

interface AlbumTableProps {
  data: CollectionAlbum[]
}

export function AlbumTable({ data }: AlbumTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>名称</TableHead>
          <TableHead>别名</TableHead>
          <TableHead>分类</TableHead>
          <TableHead>状态</TableHead>
          <TableHead>更新时间</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5} className="h-24 text-center">
              暂无图鉴
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
                  <Badge variant="outline">草稿</Badge>
                )}
              </TableCell>
              <TableCell>
                <Badge variant="secondary">
                  {SCOPE_LABELS[a.scope] ?? a.scope}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant={a.isActive ? "default" : "outline"}>
                  {a.isActive ? "启用" : "停用"}
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
