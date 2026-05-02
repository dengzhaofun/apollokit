import { useState } from "react"
import { toast } from "sonner"

import { ConfigForm } from "#/components/check-in/ConfigForm"
import { useConfigForm } from "#/components/check-in/use-config-form"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import {
  useCreateCheckInConfig,
} from "#/hooks/use-check-in"
import {
  useCreateActivityNode,
} from "#/hooks/use-activity"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"

/**
 * Inline "create check-in config + attach as node" dialog. Lives on the
 * activity detail Nodes tab so operators can configure a check-in for
 * the activity in one place — without round-tripping to the check-in
 * module to grab a refId.
 *
 * Flow:
 *   1. user fills the standard CheckInConfigForm (reused — the same one
 *      the check-in module's create page uses)
 *   2. on submit: create the config with activityId set to this activity
 *   3. then attach it as an activity node with nodeType="check_in"
 *      and refId pointing at the new config's id
 *
 * Both server calls are admin endpoints — there's no atomic two-step
 * server route, but if step 2 fails the orphan config is harmless
 * (it's already activity-scoped via activityId, so it'll be cleaned up
 * by `runArchiveCleanup` when the activity archives).
 */
interface Props {
  activityKey: string
  activityId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function InlineCheckInCreateDialog({
  activityKey,
  activityId,
  open,
  onOpenChange,
}: Props) {
  const [nodeAlias, setNodeAlias] = useState("daily_checkin")
  const createConfig = useCreateCheckInConfig()
  const createNode = useCreateActivityNode(activityKey)

  const form = useConfigForm({
    defaultValues: {
      activityId,
      isActive: true,
    },
    onSubmit: async (values) => {
      try {
        const config = await createConfig.mutateAsync({
          ...values,
          activityId,
        })
        await createNode.mutateAsync({
          alias: nodeAlias || `check_in_${Date.now().toString(36)}`,
          nodeType: "check_in",
          refId: config.id,
        })
        toast.success(m.activity_inline_create_success())
        onOpenChange(false)
      } catch (err) {
        if (err instanceof ApiError) toast.error(err.body.error)
        else toast.error(m.activity_inline_create_failed())
      }
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{m.activity_inline_create_check_in_title()}</DialogTitle>
          <DialogDescription>
            {m.activity_inline_create_check_in_desc()}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="node-alias">
              {m.activity_inline_create_node_alias_label()}
            </Label>
            <Input
              id="node-alias"
              value={nodeAlias}
              onChange={(e) =>
                setNodeAlias(e.target.value.toLowerCase().replace(/\s+/g, "_"))
              }
              placeholder="daily_checkin"
            />
            <p className="text-xs text-muted-foreground">
              {m.activity_inline_create_node_alias_hint()}
            </p>
          </div>
          <ConfigForm
            form={form}
            id="inline-checkin-form"
            hideSubmitButton
            isPending={createConfig.isPending || createNode.isPending}
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {m.common_cancel()}
          </Button>
          <Button
            type="submit"
            form="inline-checkin-form"
            disabled={createConfig.isPending || createNode.isPending}
          >
            {m.activity_inline_create_submit()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
