import { useState } from "react"
import { Plus, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"

import * as m from "#/paraglide/messages.js"
import { Button } from "#/components/ui/button"
import { Badge } from "#/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "#/components/ui/alert-dialog"
import { RewardForm } from "./RewardForm"
import {
  useCheckInRewards,
  useCreateCheckInReward,
  useUpdateCheckInReward,
  useDeleteCheckInReward,
} from "#/hooks/use-check-in-rewards"
import { useItemDefinitions } from "#/hooks/use-item"
import { ApiError } from "#/lib/api-client"
import type { CheckInReward } from "#/lib/types/check-in-reward"

interface RewardsSectionProps {
  configKey: string
}

export function RewardsSection({ configKey }: RewardsSectionProps) {
  const { data: rewards, isPending } = useCheckInRewards(configKey)
  const { data: definitions } = useItemDefinitions()
  const createMutation = useCreateCheckInReward()
  const updateMutation = useUpdateCheckInReward()
  const deleteMutation = useDeleteCheckInReward()

  const defNameMap = new Map(
    (definitions ?? []).map((d) => [d.id, d.name]),
  )

  const [createOpen, setCreateOpen] = useState(false)
  const [editingReward, setEditingReward] = useState<CheckInReward | null>(null)

  const sortedRewards = [...(rewards ?? [])].sort(
    (a, b) => a.dayNumber - b.dayNumber,
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Rewards</h3>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Plus className="size-4" />
              Add Reward
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Reward</DialogTitle>
            </DialogHeader>
            <RewardForm
              submitLabel="Add"
              isPending={createMutation.isPending}
              onSubmit={async (values) => {
                try {
                  await createMutation.mutateAsync({
                    configKey,
                    ...values,
                  })
                  toast.success("Reward added")
                  setCreateOpen(false)
                } catch (err) {
                  toast.error(
                    err instanceof ApiError
                      ? err.body.error
                      : "Failed to add reward",
                  )
                }
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {isPending ? (
        <div className="flex h-16 items-center justify-center text-muted-foreground">
          {m.common_loading()}
        </div>
      ) : sortedRewards.length === 0 ? (
        <div className="rounded-xl border bg-card p-4 text-center text-sm text-muted-foreground">
          No rewards configured. Add rewards to grant items on consecutive check-in days.
        </div>
      ) : (
        <div className="space-y-2">
          {sortedRewards.map((reward) => (
            <div
              key={reward.id}
              className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3"
            >
              <Badge variant="secondary">Day {reward.dayNumber}</Badge>
              <div className="flex-1 text-sm">
                {reward.rewardItems.map((item, i) => (
                  <span key={i}>
                    {i > 0 && ", "}
                    {item.quantity}x{" "}
                    {defNameMap.get(item.definitionId) ?? (
                      <code className="rounded bg-muted px-1 py-0.5 text-xs">
                        {item.definitionId.slice(0, 8)}...
                      </code>
                    )}
                  </span>
                ))}
              </div>

              <Dialog
                open={editingReward?.id === reward.id}
                onOpenChange={(open) => {
                  if (!open) setEditingReward(null)
                }}
              >
                <DialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => setEditingReward(reward)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Edit Reward (Day {reward.dayNumber})</DialogTitle>
                  </DialogHeader>
                  <RewardForm
                    defaultValues={{
                      dayNumber: reward.dayNumber,
                      rewardItems: reward.rewardItems,
                    }}
                    submitLabel="Save"
                    isPending={updateMutation.isPending}
                    onSubmit={async (values) => {
                      try {
                        await updateMutation.mutateAsync({
                          rewardId: reward.id,
                          ...values,
                        })
                        toast.success("Reward updated")
                        setEditingReward(null)
                      } catch (err) {
                        toast.error(
                          err instanceof ApiError
                            ? err.body.error
                            : "Failed to update reward",
                        )
                      }
                    }}
                  />
                </DialogContent>
              </Dialog>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8">
                    <Trash2 className="size-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Delete Day {reward.dayNumber} reward?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      This reward will be permanently removed.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={async () => {
                        try {
                          await deleteMutation.mutateAsync(reward.id)
                          toast.success("Reward deleted")
                        } catch (err) {
                          toast.error(
                            err instanceof ApiError
                              ? err.body.error
                              : "Failed to delete reward",
                          )
                        }
                      }}
                      disabled={deleteMutation.isPending}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {m.common_delete()}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
