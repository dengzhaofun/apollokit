import { Pencil } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "#/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "#/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import {
  useDeleteShopStage,
  useUpdateShopStage,
} from "#/hooks/use-shop"
import { ApiError } from "#/lib/api-client"
import type { ShopGrowthStage } from "#/lib/types/shop"
import * as m from "#/paraglide/messages.js"
import { ShopDeleteDialog } from "./DeleteDialog"
import { StageForm } from "./StageForm"

interface StageListProps {
  stages: ShopGrowthStage[]
}

const TRIGGER_LABEL: Record<ShopGrowthStage["triggerType"], () => string> = {
  accumulated_cost: () => m.shop_trigger_accumulated_cost(),
  accumulated_payment: () => m.shop_trigger_accumulated_payment(),
  custom_metric: () => m.shop_trigger_custom_metric(),
  manual: () => m.shop_trigger_manual(),
}

export function StageList({ stages }: StageListProps) {
  const [editing, setEditing] = useState<ShopGrowthStage | null>(null)
  const updateMutation = useUpdateShopStage()
  const deleteMutation = useDeleteShopStage()

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">{m.shop_stage_index()}</TableHead>
            <TableHead>{m.common_name()}</TableHead>
            <TableHead>{m.shop_trigger_type()}</TableHead>
            <TableHead>{m.shop_reward_items()}</TableHead>
            <TableHead className="w-32 text-right">
              {m.common_actions()}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {stages.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="h-24 text-center">
                {m.shop_no_stages()}
              </TableCell>
            </TableRow>
          ) : (
            stages.map((stage) => (
              <TableRow key={stage.id}>
                <TableCell className="font-mono text-xs">
                  {stage.stageIndex}
                </TableCell>
                <TableCell className="font-medium">{stage.name}</TableCell>
                <TableCell>{TRIGGER_LABEL[stage.triggerType]()}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {stage.rewardItems.length} item(s)
                </TableCell>
                <TableCell className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => setEditing(stage)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <ShopDeleteDialog
                    title={m.shop_delete_stage_title()}
                    description={m.shop_delete_stage_desc()}
                    isPending={deleteMutation.isPending}
                    onConfirm={async () => {
                      try {
                        await deleteMutation.mutateAsync(stage.id)
                        toast.success(m.shop_stage_deleted())
                      } catch (err) {
                        toast.error(
                          err instanceof ApiError
                            ? err.body.error
                            : m.shop_failed_delete_stage(),
                        )
                      }
                    }}
                  />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <Sheet
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <SheetContent className="overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{m.shop_edit_product()}</SheetTitle>
            <SheetDescription>
              {editing
                ? `${editing.name} (#${editing.stageIndex})`
                : null}
            </SheetDescription>
          </SheetHeader>
          {editing ? (
            <div className="px-4 py-2">
              <StageForm
                defaultValues={{
                  stageIndex: editing.stageIndex,
                  name: editing.name,
                  description: editing.description,
                  triggerType: editing.triggerType,
                  triggerConfig: editing.triggerConfig,
                  rewardItems: editing.rewardItems,
                  sortOrder: editing.sortOrder,
                }}
                isPending={updateMutation.isPending}
                submitLabel={m.common_save_changes()}
                onSubmit={async (input) => {
                  try {
                    await updateMutation.mutateAsync({
                      stageId: editing.id,
                      ...input,
                    })
                    toast.success(m.shop_stage_updated())
                    setEditing(null)
                  } catch (err) {
                    toast.error(
                      err instanceof ApiError
                        ? err.body.error
                        : m.shop_failed_update_stage(),
                    )
                  }
                }}
              />
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  )
}
