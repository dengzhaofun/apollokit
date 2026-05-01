/**
 * Reusable sortable list — drag-and-drop + keyboard navigation +
 * one-click move-to-top / move-to-bottom + ▲▼ neighbor swaps.
 *
 * All four interactions collapse onto the server's `POST /{id}/move`
 * endpoint with body `{ before | after | position }`. The server
 * recomputes the moved row's fractional sort key with a single UPDATE.
 *
 * Optimistic update: we reorder locally first, then call `onMove`. If
 * the server rejects, we revert and surface the error via the optional
 * `onError` callback (caller is expected to render a toast).
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
import { useState, type ReactNode } from "react"

import { Button } from "#/components/ui/button"

export type MoveBody =
  | { before: string }
  | { after: string }
  | { position: "first" | "last" }

export type SortableListProps<T> = {
  /** Items already sorted by the current `sort_order` ASC. */
  items: T[]
  /** Stable identity used for DnD + server move calls. */
  getId: (item: T) => string
  /**
   * Render the row content. The provided handlers correspond to the four
   * supported interactions; pass them to row-level buttons / menu items.
   * The drag handle is rendered by `SortableList` itself.
   */
  renderRow: (
    item: T,
    index: number,
    handlers: {
      moveTop: () => void
      moveBottom: () => void
      moveUp: () => void
      moveDown: () => void
    },
  ) => ReactNode
  /**
   * Called after a UI-level reorder. Should call the server `move`
   * endpoint and resolve / reject. On reject the local order rolls
   * back.
   */
  onMove: (id: string, body: MoveBody) => Promise<void>
  /** Optional toast / log callback when a server move fails. */
  onError?: (err: unknown) => void
  /** Optional class on the root list. */
  className?: string
  /** Disable all interactions (e.g. while another mutation is in flight). */
  disabled?: boolean
}

export function SortableList<T>({
  items,
  getId,
  renderRow,
  onMove,
  onError,
  className,
  disabled,
}: SortableListProps<T>) {
  // Local copy for optimistic reordering. We re-sync from `items` on every
  // render via key, so prop updates win over local optimism after server
  // confirmation reflects through.
  const [localItems, setLocalItems] = useState(items)
  // Track the last props snapshot so we know when to re-sync.
  const [propsSnap, setPropsSnap] = useState(items)
  if (items !== propsSnap) {
    setPropsSnap(items)
    setLocalItems(items)
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  async function commit(prev: T[], moved: T[], id: string, body: MoveBody) {
    setLocalItems(moved)
    try {
      await onMove(id, body)
    } catch (err) {
      setLocalItems(prev)
      onError?.(err)
    }
  }

  function moveTop(id: string) {
    if (disabled) return
    const idx = localItems.findIndex((x) => getId(x) === id)
    if (idx <= 0) return
    const next = arrayMove(localItems, idx, 0)
    commit(localItems, next, id, { position: "first" })
  }

  function moveBottom(id: string) {
    if (disabled) return
    const idx = localItems.findIndex((x) => getId(x) === id)
    if (idx === -1 || idx === localItems.length - 1) return
    const next = arrayMove(localItems, idx, localItems.length - 1)
    commit(localItems, next, id, { position: "last" })
  }

  function moveUp(id: string) {
    if (disabled) return
    const idx = localItems.findIndex((x) => getId(x) === id)
    if (idx <= 0) return
    const before = getId(localItems[idx - 1]!)
    const next = arrayMove(localItems, idx, idx - 1)
    commit(localItems, next, id, { before })
  }

  function moveDown(id: string) {
    if (disabled) return
    const idx = localItems.findIndex((x) => getId(x) === id)
    if (idx === -1 || idx === localItems.length - 1) return
    const after = getId(localItems[idx + 1]!)
    const next = arrayMove(localItems, idx, idx + 1)
    commit(localItems, next, id, { after })
  }

  function onDragEnd(e: DragEndEvent) {
    if (disabled) return
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIdx = localItems.findIndex((x) => getId(x) === String(active.id))
    const newIdx = localItems.findIndex((x) => getId(x) === String(over.id))
    if (oldIdx === -1 || newIdx === -1) return
    const moved = arrayMove(localItems, oldIdx, newIdx)
    // Pick a server-side neighbour anchor that reflects the new position.
    // Prefer "before next neighbour" when moving up, "after prev neighbour"
    // when moving down — both compute the same key class as the optimistic
    // local layout.
    let body: MoveBody
    if (newIdx === 0) {
      body = { position: "first" }
    } else if (newIdx === localItems.length - 1) {
      body = { position: "last" }
    } else if (newIdx > oldIdx) {
      body = { after: getId(moved[newIdx - 1]!) }
    } else {
      body = { before: getId(moved[newIdx + 1]!) }
    }
    commit(localItems, moved, String(active.id), body)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      modifiers={[restrictToVerticalAxis]}
    >
      <SortableContext
        items={localItems.map(getId)}
        strategy={verticalListSortingStrategy}
        disabled={disabled}
      >
        <ul className={className ?? "flex flex-col gap-1"}>
          {localItems.map((item, i) => {
            const id = getId(item)
            const handlers = {
              moveTop: () => moveTop(id),
              moveBottom: () => moveBottom(id),
              moveUp: () => moveUp(id),
              moveDown: () => moveDown(id),
            }
            return (
              <SortableRow key={id} id={id}>
                {renderRow(item, i, handlers)}
              </SortableRow>
            )
          })}
        </ul>
      </SortableContext>
    </DndContext>
  )
}

function SortableRow({
  id,
  children,
}: {
  id: string
  children: ReactNode
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  }
  return (
    <li ref={setNodeRef} style={style} className="flex items-center gap-2">
      <button
        type="button"
        aria-label="Drag to reorder"
        className="cursor-grab text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <div className="flex-1">{children}</div>
    </li>
  )
}

/**
 * Convenience action button row matching the four supported interactions.
 * Use inside `renderRow` or assemble your own — the handlers are also
 * exposed through `renderRow`'s third argument.
 */
export function SortableActions({
  onMoveTop,
  onMoveUp,
  onMoveDown,
  onMoveBottom,
  disabled,
}: {
  onMoveTop: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onMoveBottom: () => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center gap-0.5">
      <Button
        size="icon"
        variant="ghost"
        aria-label="Move to top"
        onClick={onMoveTop}
        disabled={disabled}
      >
        <ArrowUpToLine className="size-3.5" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        aria-label="Move up"
        onClick={onMoveUp}
        disabled={disabled}
      >
        <ArrowUp className="size-3.5" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        aria-label="Move down"
        onClick={onMoveDown}
        disabled={disabled}
      >
        <ArrowDown className="size-3.5" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        aria-label="Move to bottom"
        onClick={onMoveBottom}
        disabled={disabled}
      >
        <ArrowDownToLine className="size-3.5" />
      </Button>
    </div>
  )
}
