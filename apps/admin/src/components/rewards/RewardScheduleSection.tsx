import { useEffect, useRef, useState } from "react"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "#/components/ui/alert-dialog"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import { FormDialog } from "#/components/ui/form-dialog"
import { ItemRewardRow } from "#/components/item/ItemRewardRow"
import { RewardEntryEditor } from "#/components/rewards/RewardEntryEditor"
import { ApiError } from "#/lib/api-client"
import { cn } from "#/lib/utils"
import * as m from "#/paraglide/messages.js"
import type { RewardEntry, RewardType } from "#/lib/types/rewards"

export interface RewardTrack<TItem> {
  id: string
  label: string
  getRewards: (item: TItem) => RewardEntry[]
  setRewards: (item: TItem, rewards: RewardEntry[]) => TItem
}

export interface RewardScheduleKeyFieldsProps<TItem> {
  draft: TItem
  onChange: (next: TItem) => void
  /** Validation message to display next to the key fields, if any. */
  error?: string
}

export interface RewardScheduleSectionProps<TItem> {
  /** Section title shown above the list. Defaults to the generic Rewards label. */
  title?: string
  description?: string
  /** DOM id used as a fragment anchor (e.g. `"rewards"` for `#rewards`). */
  anchorId?: string
  /** When the URL hash matches this anchor on first paint, the Add button briefly pulses. */
  highlightAddOnMount?: boolean

  list: TItem[]
  isPending?: boolean

  getId: (item: TItem) => string
  /** Short label rendered as a leading badge per row, e.g. "Day 3" / "Rank 1-5". */
  keyLabel: (item: TItem) => string
  /** Returns a fresh draft used to seed the create dialog. */
  newDraft: () => TItem
  /** Renders the key-editor inputs inside the create/edit dialog. */
  KeyFields: React.ComponentType<RewardScheduleKeyFieldsProps<TItem>>
  /** Optional pre-submit validation. Return an error message to block submit. */
  validate?: (draft: TItem) => string | null

  /** One track per parallel reward bucket. Single-track callers pass one. */
  tracks: RewardTrack<TItem>[]

  onCreate: (draft: TItem) => Promise<void>
  onUpdate: (item: TItem) => Promise<void>
  onDelete: (item: TItem) => Promise<void>

  allowedTypes?: RewardType[]
  emptyHint?: string
}

/**
 * Generic "schedule" of reward entries — every module that lists multiple
 * `RewardEntry[]` rows keyed by something (day number, threshold, rank
 * range, level, progress alias) renders through this component. Single-
 * track and multi-track (battle-pass free/premium/premium_plus) layouts
 * share the same shell.
 *
 * Persistence is row-level: callers wire `onCreate`/`onUpdate`/`onDelete`
 * to whatever fits their storage (independent child tables vs jsonb-in-
 * row patches on the parent config). The component is unaware of either.
 */
export function RewardScheduleSection<TItem>({
  title,
  description,
  anchorId,
  highlightAddOnMount,
  list,
  isPending,
  getId,
  keyLabel,
  newDraft,
  KeyFields,
  validate,
  tracks,
  onCreate,
  onUpdate,
  onDelete,
  allowedTypes,
  emptyHint,
}: RewardScheduleSectionProps<TItem>) {
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<TItem | null>(null)
  const [pendingDelete, setPendingDelete] = useState<TItem | null>(null)
  const [highlight, setHighlight] = useState(false)

  const addBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!highlightAddOnMount || !anchorId) return
    if (typeof window === "undefined") return
    if (window.location.hash !== `#${anchorId}`) return

    setHighlight(true)
    const el = addBtnRef.current
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" })
    const t = window.setTimeout(() => setHighlight(false), 2400)
    return () => window.clearTimeout(t)
  }, [anchorId, highlightAddOnMount])

  return (
    <section className="space-y-3" id={anchorId}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">
            {title ?? m.reward_section_title()}
          </h3>
          {description ? (
            <p className="text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <Button
          ref={addBtnRef}
          size="sm"
          variant="outline"
          className={cn(highlight && "animate-pulse ring-2 ring-primary")}
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="size-4" />
          {m.reward_add_button()}
        </Button>
      </div>

      {isPending ? (
        <div className="flex h-16 items-center justify-center text-muted-foreground">
          {m.common_loading()}
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          {emptyHint ?? m.reward_empty_hint()}
        </div>
      ) : (
        <ul className="space-y-2">
          {list.map((item) => (
            <li
              key={getId(item)}
              className="flex flex-col gap-2 rounded-lg border bg-card p-3 sm:flex-row sm:items-start sm:gap-3"
            >
              <Badge variant="secondary" className="self-start whitespace-nowrap">
                {keyLabel(item)}
              </Badge>
              <div className="min-w-0 flex-1 space-y-1.5">
                {tracks.map((track) => {
                  const rewards = track.getRewards(item)
                  return (
                    <div
                      key={track.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
                    >
                      {tracks.length > 1 ? (
                        <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {track.label}
                        </span>
                      ) : null}
                      {rewards.length === 0 ? (
                        <span className="text-xs text-muted-foreground">
                          {m.reward_table_no_config()}
                        </span>
                      ) : (
                        rewards.map((entry, i) => (
                          <ItemRewardRow
                            key={`${entry.type}:${entry.id}:${i}`}
                            size="sm"
                            entry={entry}
                          />
                        ))
                      )}
                    </div>
                  )
                })}
              </div>
              <div className="flex shrink-0 items-center gap-1 self-end sm:self-start">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => setEditing(item)}
                  aria-label={m.common_edit()}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-destructive hover:text-destructive"
                  onClick={() => setPendingDelete(item)}
                  aria-label={m.common_delete()}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {createOpen ? (
        <RewardScheduleDialog
          mode="create"
          initial={newDraft()}
          KeyFields={KeyFields}
          tracks={tracks}
          validate={validate}
          allowedTypes={allowedTypes}
          onSubmit={async (draft) => {
            await onCreate(draft)
          }}
          onClose={() => setCreateOpen(false)}
        />
      ) : null}

      {editing ? (
        <RewardScheduleDialog
          mode="edit"
          initial={editing}
          KeyFields={KeyFields}
          tracks={tracks}
          validate={validate}
          allowedTypes={allowedTypes}
          onSubmit={async (draft) => {
            await onUpdate(draft)
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {m.reward_delete_confirm_title()}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete ? keyLabel(pendingDelete) : null}
              {" — "}
              {m.reward_delete_confirm_desc()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                const target = pendingDelete
                if (!target) return
                try {
                  await onDelete(target)
                  setPendingDelete(null)
                } catch (err) {
                  toast.error(
                    err instanceof ApiError
                      ? err.body.error
                      : m.common_failed_action(),
                  )
                }
              }}
            >
              {m.common_delete()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

interface DialogProps<TItem> {
  mode: "create" | "edit"
  initial: TItem
  KeyFields: React.ComponentType<RewardScheduleKeyFieldsProps<TItem>>
  tracks: RewardTrack<TItem>[]
  validate?: (draft: TItem) => string | null
  allowedTypes?: RewardType[]
  onSubmit: (draft: TItem) => Promise<void>
  onClose: () => void
}

function RewardScheduleDialog<TItem>({
  mode,
  initial,
  KeyFields,
  tracks,
  validate,
  allowedTypes,
  onSubmit,
  onClose,
}: DialogProps<TItem>) {
  const [draft, setDraft] = useState<TItem>(initial)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const dirty = draft !== initial

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const validationError = validate?.(draft) ?? defaultValidate(draft, tracks)
    if (validationError) {
      setError(validationError)
      return
    }
    setError(null)
    setSaving(true)
    try {
      await onSubmit(draft)
      onClose()
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.body.error : m.common_failed_action(),
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      isDirty={dirty && !saving}
      title={
        mode === "create" ? m.reward_add_button() : m.reward_edit_title()
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {m.common_cancel()}
          </Button>
          <Button
            type="submit"
            form="reward-schedule-form"
            disabled={saving}
          >
            {saving ? m.common_saving() : m.reward_save_button()}
          </Button>
        </>
      }
    >
      <form
        id="reward-schedule-form"
        onSubmit={handleSubmit}
        className="space-y-4"
      >
        <KeyFields
          draft={draft}
          onChange={setDraft}
          error={error ?? undefined}
        />

        {tracks.map((track) => (
          <RewardEntryEditor
            key={track.id}
            label={track.label}
            entries={track.getRewards(draft)}
            onChange={(next) => setDraft((d) => track.setRewards(d, next))}
            allowedTypes={allowedTypes}
          />
        ))}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </form>
    </FormDialog>
  )
}

function defaultValidate<TItem>(
  draft: TItem,
  tracks: RewardTrack<TItem>[],
): string | null {
  const totalEntries = tracks.reduce(
    (sum, t) =>
      sum + t.getRewards(draft).filter((e) => e.id && e.count > 0).length,
    0,
  )
  if (totalEntries === 0) return m.reward_at_least_one()
  return null
}
