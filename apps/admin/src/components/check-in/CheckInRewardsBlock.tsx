import { useState } from "react"
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
import { useCheckInConfig } from "#/hooks/use-check-in"
import {
  useCheckInRewards,
  useCreateCheckInReward,
  useDeleteCheckInReward,
  useUpdateCheckInReward,
} from "#/hooks/use-check-in-rewards"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"
import type { CheckInReward } from "#/lib/types/check-in-reward"
import type { RewardEntry } from "#/lib/types/rewards"

import { DirtyRewardsAlert } from "./reward-scheduler/DirtyRewardsAlert"
import { RewardCellDialog } from "./reward-scheduler/RewardCellDialog"
import { RewardFreeformView } from "./reward-scheduler/RewardFreeformView"
import { RewardMonthView } from "./reward-scheduler/RewardMonthView"
import { RewardTargetView } from "./reward-scheduler/RewardTargetView"
import { RewardWeekView } from "./reward-scheduler/RewardWeekView"
import { maxDayForConfig, useRewardMap } from "./reward-scheduler/use-reward-map"

interface Props {
  configKey: string
}

interface DialogState {
  mode: "create" | "edit"
  dayNumber: number
  dayNumberEditable: boolean
  initial: { dayNumber: number; rewardItems: RewardEntry[] }
  existingId: string | null
}

/**
 * Top-level dispatcher for the check-in reward editor. Picks the right
 * view (week / month / target / freeform) based on `resetMode + target`,
 * and owns the single shared cell-edit dialog so each view stays purely
 * presentational.
 */
export function CheckInRewardsBlock({ configKey }: Props) {
  const { data: config, isPending: configPending } = useCheckInConfig(configKey)
  const { data: rewards, isPending: rewardsPending } =
    useCheckInRewards(configKey)

  const createMutation = useCreateCheckInReward()
  const updateMutation = useUpdateCheckInReward()
  const deleteMutation = useDeleteCheckInReward()

  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [pendingDelete, setPendingDelete] = useState<CheckInReward | null>(null)

  const map = useRewardMap(config, rewards)

  if (configPending || !config) {
    return (
      <section
        id="rewards"
        className="rounded-xl border bg-card p-6 text-sm text-muted-foreground"
      >
        {m.common_loading()}
      </section>
    )
  }

  function openSlot(dayNumber: number, existing: CheckInReward | undefined) {
    setDialog({
      mode: existing ? "edit" : "create",
      dayNumber,
      dayNumberEditable: false,
      initial: {
        dayNumber,
        rewardItems: existing?.rewardItems ?? [],
      },
      existingId: existing?.id ?? null,
    })
  }

  function openOrphan(reward: CheckInReward) {
    setDialog({
      mode: "edit",
      dayNumber: reward.dayNumber,
      dayNumberEditable: true,
      initial: {
        dayNumber: reward.dayNumber,
        rewardItems: reward.rewardItems,
      },
      existingId: reward.id,
    })
  }

  async function handleSubmit(payload: {
    dayNumber: number
    rewardItems: RewardEntry[]
  }) {
    if (!dialog) return
    if (dialog.mode === "create") {
      await createMutation.mutateAsync({
        configKey,
        dayNumber: payload.dayNumber,
        rewardItems: payload.rewardItems,
      })
    } else if (dialog.existingId) {
      await updateMutation.mutateAsync({
        rewardId: dialog.existingId,
        dayNumber: payload.dayNumber,
        rewardItems: payload.rewardItems,
      })
    }
  }

  async function handleDialogDelete() {
    if (!dialog?.existingId) return
    await deleteMutation.mutateAsync(dialog.existingId)
  }

  async function confirmOrphanDelete() {
    if (!pendingDelete) return
    try {
      await deleteMutation.mutateAsync(pendingDelete.id)
      setPendingDelete(null)
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.body.error : m.common_failed_action(),
      )
    }
  }

  // Freeform view (none + target=null) keeps its own RewardScheduleSection
  // shell with a built-in Add button — render it without the standard header.
  if (config.resetMode === "none" && config.target == null) {
    return (
      <section id="rewards" className="space-y-3">
        <RewardFreeformView
          configKey={configKey}
          rewards={rewards ?? []}
          isPending={rewardsPending}
        />
      </section>
    )
  }

  const sectionTitle =
    config.resetMode === "week"
      ? m.checkin_view_week_title()
      : config.resetMode === "month"
        ? m.checkin_view_month_title()
        : m.checkin_view_target_title()

  return (
    <section id="rewards" className="space-y-3">
      <h3 className="text-sm font-semibold">{sectionTitle}</h3>

      <DirtyRewardsAlert
        orphans={map.orphans}
        onEdit={openOrphan}
        onDelete={(r) => setPendingDelete(r)}
      />

      {rewardsPending ? (
        <div className="flex h-16 items-center justify-center text-sm text-muted-foreground">
          {m.common_loading()}
        </div>
      ) : config.resetMode === "week" ? (
        <RewardWeekView
          config={config}
          byDay={map.byDay}
          onOpenSlot={openSlot}
        />
      ) : config.resetMode === "month" ? (
        <RewardMonthView
          config={config}
          byDay={map.byDay}
          onOpenSlot={openSlot}
        />
      ) : config.target != null ? (
        <RewardTargetView
          target={config.target}
          byDay={map.byDay}
          onOpenSlot={openSlot}
        />
      ) : null}

      {dialog ? (
        <RewardCellDialog
          open
          onOpenChange={(next) => {
            if (!next) setDialog(null)
          }}
          mode={dialog.mode}
          initial={dialog.initial}
          dayNumberEditable={dialog.dayNumberEditable}
          dayNumberMax={maxDayForConfig(config)}
          slotLabel={m.checkin_reward_day_n({ n: dialog.dayNumber })}
          onSubmit={handleSubmit}
          onDelete={dialog.existingId ? handleDialogDelete : undefined}
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
              {pendingDelete
                ? m.checkin_reward_day_n({ n: pendingDelete.dayNumber })
                : null}
              {" — "}
              {m.reward_delete_confirm_desc()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={confirmOrphanDelete}
            >
              {m.common_delete()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
