import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { restrictToVerticalAxis } from "@dnd-kit/modifiers"
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Link } from "#/components/router-helpers"
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  ExternalLink,
  GripVertical,
  Pencil,
  Trash2,
} from "lucide-react"
import { format } from "date-fns"

import type { MoveBody } from "#/components/common/SortableList"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import { openEditChildModal } from "#/lib/modal-search"
import * as m from "#/paraglide/messages.js"
import type { Banner } from "#/lib/types/banner"
import { describeLinkAction } from "#/lib/types/link"

interface BannerTableProps {
  data: Banner[]
  groupId: string
  /**
   * Single-row move — the new endpoint. Receives `(id, body)` where
   * `body` is one of the four `MoveBody` shapes (before / after /
   * position: "first" | "last"). Used by drag-drop, ▲▼, 置顶/置后.
   */
  onMove: (bannerId: string, body: MoveBody) => void
  onDelete: (bannerId: string) => void
  isBusy?: boolean
}

function visibilityLabel(row: Banner): string {
  const parts: string[] = []
  if (row.visibleFrom)
    parts.push(format(new Date(row.visibleFrom), "MM-dd HH:mm"))
  parts.push("→")
  if (row.visibleUntil)
    parts.push(format(new Date(row.visibleUntil), "MM-dd HH:mm"))
  else parts.push("∞")
  if (!row.visibleFrom && !row.visibleUntil) return "—"
  return parts.join(" ")
}

export function BannerTable({
  data,
  groupId,
  onMove,
  onDelete,
  isBusy,
}: BannerTableProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  function handleDragEnd(e: DragEndEvent) {
    if (isBusy) return
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIdx = data.findIndex((b) => b.id === active.id)
    const newIdx = data.findIndex((b) => b.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    // Compute neighbour anchor based on the post-move local layout.
    const moved = arrayMove(data, oldIdx, newIdx)
    let body: MoveBody
    if (newIdx === 0) body = { position: "first" }
    else if (newIdx === data.length - 1) body = { position: "last" }
    else if (newIdx > oldIdx) body = { after: moved[newIdx - 1]!.id }
    else body = { before: moved[newIdx + 1]!.id }
    onMove(String(active.id), body)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToVerticalAxis]}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead className="w-28">{m.banner_col_preview()}</TableHead>
            <TableHead>{m.banner_col_title()}</TableHead>
            <TableHead>{m.banner_col_visibility()}</TableHead>
            <TableHead>{m.banner_col_target()}</TableHead>
            <TableHead>{m.banner_col_link()}</TableHead>
            <TableHead>{m.banner_col_status()}</TableHead>
            <TableHead className="w-48 text-right">
              {m.banner_col_actions()}
            </TableHead>
          </TableRow>
        </TableHeader>
        <SortableContext
          items={data.map((d) => d.id)}
          strategy={verticalListSortingStrategy}
          disabled={isBusy}
        >
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  {m.banner_banners_empty()}
                </TableCell>
              </TableRow>
            ) : (
              data.map((row, index) => (
                <SortableBannerRow
                  key={row.id}
                  row={row}
                  groupId={groupId}
                  index={index}
                  total={data.length}
                  prevId={data[index - 1]?.id}
                  nextId={data[index + 1]?.id}
                  onMove={onMove}
                  onDelete={onDelete}
                  isBusy={isBusy}
                />
              ))
            )}
          </TableBody>
        </SortableContext>
      </Table>
    </DndContext>
  )
}

// ─── Sortable row ──────────────────────────────────────────────────────

function SortableBannerRow({
  row,
  groupId,
  index,
  total,
  prevId,
  nextId,
  onMove,
  onDelete,
  isBusy,
}: {
  row: Banner
  groupId: string
  index: number
  total: number
  prevId: string | undefined
  nextId: string | undefined
  onMove: (id: string, body: MoveBody) => void
  onDelete: (id: string) => void
  isBusy?: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  }
  const linkDesc = describeLinkAction(row.linkAction)
  const isExternal = row.linkAction.type === "external"

  // Look up neighbours by index for the ▲▼ buttons.
  const isFirst = index === 0
  const isLast = index === total - 1

  return (
    <TableRow ref={setNodeRef} style={style}>
      <TableCell className="w-8 cursor-grab align-middle text-muted-foreground hover:text-foreground">
        <button
          type="button"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
          className="flex h-8 w-8 items-center justify-center"
        >
          <GripVertical className="size-4" />
        </button>
      </TableCell>
      <TableCell>
        {row.imageUrlMobile ? (
          <img
            src={row.imageUrlMobile}
            alt={row.altText ?? row.title}
            className="h-10 w-20 rounded object-cover"
          />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="font-medium">{row.title}</TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground">
        {visibilityLabel(row)}
      </TableCell>
      <TableCell>
        <Badge variant="secondary">
          {row.targetType === "broadcast"
            ? m.banner_target_broadcast()
            : m.banner_target_multicast()}
          {row.targetType === "multicast" && row.targetUserIds?.length
            ? ` · ${row.targetUserIds.length}`
            : null}
        </Badge>
      </TableCell>
      <TableCell className="max-w-[220px] truncate">
        {isExternal ? (
          <a
            href={row.linkAction.type === "external" ? row.linkAction.url : "#"}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm hover:underline"
          >
            <span className="truncate">{linkDesc}</span>
            <ExternalLink className="size-3 shrink-0" />
          </a>
        ) : (
          <span className="text-sm text-muted-foreground">{linkDesc}</span>
        )}
      </TableCell>
      <TableCell>
        <Badge variant={row.isActive ? "default" : "outline"}>
          {row.isActive
            ? m.banner_status_active()
            : m.banner_status_inactive()}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            disabled={isBusy || isFirst}
            title="置顶"
            onClick={() => onMove(row.id, { position: "first" })}
          >
            <ArrowUpToLine className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            disabled={isBusy || isFirst || !prevId}
            title={m.banner_move_up()}
            onClick={() => prevId && onMove(row.id, { before: prevId })}
          >
            <ArrowUp className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            disabled={isBusy || isLast || !nextId}
            title={m.banner_move_down()}
            onClick={() => nextId && onMove(row.id, { after: nextId })}
          >
            <ArrowDown className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            disabled={isBusy || isLast}
            title="置后"
            onClick={() => onMove(row.id, { position: "last" })}
          >
            <ArrowDownToLine className="size-3.5" />
          </Button>
          <Button
            render={
              <Link
                to="/banner/$groupId"
                params={{ groupId }}
                search={(prev: Record<string, unknown>) => ({
                  ...prev,
                  ...openEditChildModal("banner", row.id),
                })}
                title={m.common_edit()}
              >
                <Pencil className="size-4" />
              </Link>
            }
            variant="ghost"
            size="icon"
            className="size-8"
          />
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-destructive"
            disabled={isBusy}
            title={m.common_delete()}
            onClick={() => onDelete(row.id)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}
