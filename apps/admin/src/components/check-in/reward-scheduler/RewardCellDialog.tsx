import { useState } from "react"
import { toast } from "sonner"

import { Button } from "#/components/ui/button"
import { FormDialog } from "#/components/ui/form-dialog"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { RewardEntryEditor } from "#/components/rewards/RewardEntryEditor"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"
import type { RewardEntry } from "#/lib/types/rewards"

interface DialogPayload {
  dayNumber: number
  rewardItems: RewardEntry[]
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: "create" | "edit"
  initial: { dayNumber: number; rewardItems: RewardEntry[] }
  /** When true, the dayNumber input is editable (used by orphan repair). Otherwise it's a read-only badge. */
  dayNumberEditable?: boolean
  /** Inclusive upper bound enforced client-side. `null` = no bound (mode=none, target=null). */
  dayNumberMax: number | null
  /** Optional pretty label for the slot, e.g. "Monday" or "Day 5". */
  slotLabel?: string
  onSubmit: (payload: DialogPayload) => Promise<void>
  onDelete?: () => Promise<void>
}

/**
 * Unified create/edit dialog for one (dayNumber → rewardItems) row. The
 * surrounding view (week/month/target) computes the slot's dayNumber and
 * passes it in. The dayNumber field is read-only by default and only
 * becomes a number input when `dayNumberEditable` is on (orphan repair).
 */
export function RewardCellDialog({
  open,
  onOpenChange,
  mode,
  initial,
  dayNumberEditable,
  dayNumberMax,
  slotLabel,
  onSubmit,
  onDelete,
}: Props) {
  const [dayNumber, setDayNumber] = useState<number>(initial.dayNumber)
  const [rewardItems, setRewardItems] = useState<RewardEntry[]>(
    initial.rewardItems,
  )
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const dirty =
    dayNumber !== initial.dayNumber ||
    rewardItems !== initial.rewardItems

  function close() {
    if (saving || deleting) return
    onOpenChange(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!Number.isInteger(dayNumber) || dayNumber < 1) {
      setError(m.checkin_day_number_required())
      return
    }
    if (dayNumberMax != null && dayNumber > dayNumberMax) {
      setError(m.checkin_day_number_out_of_range({ max: dayNumberMax }))
      return
    }
    const filledItems = rewardItems.filter(
      (e) => e.id && Number(e.count) > 0,
    )
    if (filledItems.length === 0) {
      setError(m.reward_at_least_one())
      return
    }
    setError(null)
    setSaving(true)
    try {
      await onSubmit({ dayNumber, rewardItems: filledItems })
      onOpenChange(false)
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.body.error : m.common_failed_action(),
      )
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!onDelete) return
    setDeleting(true)
    try {
      await onDelete()
      onOpenChange(false)
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.body.error : m.common_failed_action(),
      )
    } finally {
      setDeleting(false)
    }
  }

  const headline =
    slotLabel ??
    m.checkin_reward_day_n({ n: dayNumber })

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true)
        else close()
      }}
      isDirty={dirty && !saving && !deleting}
      title={
        mode === "create"
          ? m.checkin_reward_dialog_create_title({ slot: headline })
          : m.checkin_reward_dialog_edit_title({ slot: headline })
      }
      footer={
        <>
          {mode === "edit" && onDelete ? (
            <Button
              type="button"
              variant="outline"
              className="text-destructive hover:text-destructive sm:mr-auto"
              disabled={saving || deleting}
              onClick={handleDelete}
            >
              {deleting ? m.common_saving() : m.common_delete()}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={close}
            disabled={saving || deleting}
          >
            {m.common_cancel()}
          </Button>
          <Button
            type="submit"
            form="reward-cell-form"
            disabled={saving || deleting}
          >
            {saving ? m.common_saving() : m.reward_save_button()}
          </Button>
        </>
      }
    >
      <form
        id="reward-cell-form"
        onSubmit={handleSubmit}
        className="space-y-4"
      >
        <div className="space-y-2">
          <Label htmlFor="reward-cell-day">
            {m.checkin_day_number_label()}
          </Label>
          {dayNumberEditable ? (
            <>
              <Input
                id="reward-cell-day"
                type="number"
                min={1}
                max={dayNumberMax ?? undefined}
                value={dayNumber}
                onChange={(e) =>
                  setDayNumber(Number(e.target.value) || 1)
                }
              />
              {dayNumberMax != null ? (
                <p className="text-xs text-muted-foreground">
                  {m.checkin_day_number_range_hint({ max: dayNumberMax })}
                </p>
              ) : null}
            </>
          ) : (
            <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm font-medium">
              {headline}
            </p>
          )}
        </div>

        <RewardEntryEditor
          label={m.reward_section_title()}
          entries={rewardItems}
          onChange={setRewardItems}
        />

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </form>
    </FormDialog>
  )
}
