/**
 * Shared sortable table primitives — drop into any existing
 * `<Table>` / `<TableBody>` to get drag-drop reordering + ▲▼ +
 * 置顶/置后 row actions, all wired to the unified `/move` endpoint
 * on the server.
 *
 * Usage pattern (see `components/banner/BannerTable.tsx` for the
 * canonical example):
 *
 *   <SortableTableProvider items={data} onMove={handleMove} disabled={busy}>
 *     <Table>
 *       <TableHeader>...<TableHead className="w-8" /> ...</TableHeader>
 *       <TableBody>
 *         {data.map((row, i) => (
 *           <SortableTableRow key={row.id} id={row.id} prevId={data[i-1]?.id} nextId={data[i+1]?.id}>
 *             <TableCell>...</TableCell>
 *             ...
 *           </SortableTableRow>
 *         ))}
 *       </TableBody>
 *     </Table>
 *   </SortableTableProvider>
 *
 * The first <TableCell> rendered inside SortableTableRow is the
 * drag handle (rendered automatically). Add `<RowMoveActions row={row}
 * prevId={...} nextId={...} isFirst={i===0} isLast={i===data.length-1} />`
 * inside your action column to surface the four buttons.
 */

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
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  GripVertical,
} from "lucide-react"
import { type ReactNode, createContext, useContext, useMemo } from "react"

import { Button } from "#/components/ui/button"
import { TableCell, TableRow } from "#/components/ui/table"

import type { MoveBody } from "./SortableList"

// ─── Context ──────────────────────────────────────────────────────────

type SortableContextShape = {
  onMove: (id: string, body: MoveBody) => void
  disabled: boolean
}

const Ctx = createContext<SortableContextShape | null>(null)

function useSortableTable() {
  const v = useContext(Ctx)
  if (!v)
    throw new Error("useSortableTable must be used inside SortableTableProvider")
  return v
}

// ─── Provider ─────────────────────────────────────────────────────────

export type SortableTableProviderProps<T extends { id: string }> = {
  items: T[]
  onMove: (id: string, body: MoveBody) => void
  disabled?: boolean
  children: ReactNode
}

/**
 * Wraps the surrounding `<Table>` with `DndContext` + `SortableContext`,
 * computes the right `MoveBody` on drag-end and forwards to `onMove`.
 */
export function SortableTableProvider<T extends { id: string }>({
  items,
  onMove,
  disabled,
  children,
}: SortableTableProviderProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const ctx = useMemo<SortableContextShape>(
    () => ({ onMove, disabled: !!disabled }),
    [onMove, disabled],
  )

  function handleDragEnd(e: DragEndEvent) {
    if (disabled) return
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIdx = items.findIndex((b) => b.id === active.id)
    const newIdx = items.findIndex((b) => b.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    const moved = arrayMove(items, oldIdx, newIdx)
    let body: MoveBody
    if (newIdx === 0) body = { position: "first" }
    else if (newIdx === items.length - 1) body = { position: "last" }
    else if (newIdx > oldIdx) body = { after: moved[newIdx - 1]!.id }
    else body = { before: moved[newIdx + 1]!.id }
    onMove(String(active.id), body)
  }

  return (
    <Ctx.Provider value={ctx}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        modifiers={[restrictToVerticalAxis]}
      >
        <SortableContext
          items={items.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
          disabled={disabled}
        >
          {children}
        </SortableContext>
      </DndContext>
    </Ctx.Provider>
  )
}

// ─── Row ──────────────────────────────────────────────────────────────

export type SortableTableRowProps = {
  id: string
  /** Render extra cells (after the drag-handle cell). */
  children: ReactNode
  /** Forwarded to the `<TableRow>` className. */
  className?: string
}

/**
 * Replacement for `<TableRow>` that adds a leading drag-handle cell.
 * Place inside `<SortableTableProvider>` and the parent `<TableHeader>`
 * needs a leading `<TableHead className="w-8" />` to align the columns.
 */
export function SortableTableRow({
  id,
  children,
  className,
}: SortableTableRowProps) {
  const { disabled } = useSortableTable()
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  }
  return (
    <TableRow ref={setNodeRef} style={style} className={className}>
      <TableCell className="w-8 cursor-grab align-middle text-muted-foreground hover:text-foreground">
        <button
          type="button"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
          className="flex h-8 w-8 items-center justify-center"
          disabled={disabled}
        >
          <GripVertical className="size-4" />
        </button>
      </TableCell>
      {children}
    </TableRow>
  )
}

// ─── Action buttons (置顶 / ▲ / ▼ / 置后) ─────────────────────────────

export type RowMoveActionsProps = {
  id: string
  /** Neighbour ids — used so ▲ and ▼ pass `{before/after}` instead of jumping. */
  prevId: string | undefined
  nextId: string | undefined
  isFirst: boolean
  isLast: boolean
  /** Optional extra disable flag (e.g. row-level mutation in flight). */
  disabled?: boolean
}

/**
 * The four canonical move buttons. Drop into your row's actions column
 * alongside Edit / Delete buttons.
 */
export function RowMoveActions({
  id,
  prevId,
  nextId,
  isFirst,
  isLast,
  disabled: extraDisabled,
}: RowMoveActionsProps) {
  const { onMove, disabled } = useSortableTable()
  const off = disabled || extraDisabled
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8"
        disabled={off || isFirst}
        title="置顶"
        onClick={() => onMove(id, { position: "first" })}
      >
        <ArrowUpToLine className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8"
        disabled={off || isFirst || !prevId}
        title="上移"
        onClick={() => prevId && onMove(id, { before: prevId })}
      >
        <ArrowUp className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8"
        disabled={off || isLast || !nextId}
        title="下移"
        onClick={() => nextId && onMove(id, { after: nextId })}
      >
        <ArrowDown className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8"
        disabled={off || isLast}
        title="置后"
        onClick={() => onMove(id, { position: "last" })}
      >
        <ArrowDownToLine className="size-3.5" />
      </Button>
    </>
  )
}

export type { MoveBody }
