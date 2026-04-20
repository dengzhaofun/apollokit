import { useState } from "react"
import { toast } from "sonner"

import { ConfigForm as CheckInConfigForm } from "#/components/check-in/ConfigForm"
import { GroupForm as BannerGroupForm } from "#/components/banner/GroupForm"
import { LotteryPoolForm } from "#/components/lottery/PoolForm"
import { Button } from "#/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import { useCreateBannerGroup } from "#/hooks/use-banner"
import { useCreateCheckInConfig } from "#/hooks/use-check-in"
import { useCreateLotteryPool } from "#/hooks/use-lottery"
import { useCreateActivityNode } from "#/hooks/use-activity"
import { ApiError } from "#/lib/api-client"
import type { NodeType } from "#/lib/types/activity"
import * as m from "#/paraglide/messages.js"

type Mode = "inline" | "redirect"

function supportedTypes(): { value: NodeType; label: string; mode: Mode }[] {
  return [
    { value: "check_in", label: m.activity_node_type_check_in(), mode: "inline" },
    { value: "banner", label: m.activity_node_type_banner(), mode: "inline" },
    { value: "lottery", label: m.activity_node_type_lottery(), mode: "inline" },
    { value: "task_group", label: m.activity_node_type_task_group(), mode: "redirect" },
    { value: "exchange", label: m.activity_node_type_exchange(), mode: "redirect" },
  ]
}

interface Props {
  activityKey: string
  activityId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * "新建并挂载" — creates the underlying config (bound to the activity
 * via activityId) and then creates the activity node referencing its id.
 *
 * Supported node types in this MVP dialog: check_in, banner, lottery.
 * task_group and exchange have more complex forms (category/category
 * dependencies, reward editor, time-window discriminator) that are
 * awkward to drop in here without scope creep — the admin can still
 * create those via their own module pages (which now have an "关联活动"
 * dropdown) and come back to mount by refId.
 */
export function NodeCreatorDialog({
  activityKey,
  activityId,
  open,
  onOpenChange,
}: Props) {
  const [nodeType, setNodeType] = useState<NodeType>("check_in")
  const [alias, setAlias] = useState("")
  const [orderIndex, setOrderIndex] = useState(0)

  const createNode = useCreateActivityNode(activityKey)
  const createCheckIn = useCreateCheckInConfig()
  const createBanner = useCreateBannerGroup()
  const createLottery = useCreateLotteryPool()

  const anyPending =
    createNode.isPending ||
    createCheckIn.isPending ||
    createBanner.isPending ||
    createLottery.isPending

  function reset() {
    setNodeType("check_in")
    setAlias("")
    setOrderIndex((n) => n + 1)
  }

  async function mountAfterCreate(refId: string) {
    await createNode.mutateAsync({
      alias,
      nodeType,
      refId,
      orderIndex,
    })
    toast.success(m.activity_node_mounted_success())
    reset()
    onOpenChange(false)
  }

  const types = supportedTypes()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{m.activity_node_create_title()}</DialogTitle>
          <DialogDescription>
            {m.activity_node_create_description()}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3 py-2">
          <div className="flex flex-col gap-1.5">
            <Label>{m.activity_node_field_type()}</Label>
            <Select
              value={nodeType}
              onValueChange={(v) => setNodeType(v as NodeType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {types.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{m.activity_node_field_alias()}</Label>
            <Input
              value={alias}
              onChange={(e) => setAlias(e.target.value.toLowerCase())}
              placeholder="day7_checkin"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{m.activity_node_field_order()}</Label>
            <Input
              type="number"
              value={orderIndex}
              onChange={(e) => setOrderIndex(Number(e.target.value) || 0)}
            />
          </div>
        </div>

        <div className="rounded-lg border p-4">
          {nodeType === "check_in" ? (
            <CheckInConfigForm
              defaultValues={{ activityId }}
              isPending={anyPending}
              submitLabel={m.activity_node_submit_check_in()}
              onSubmit={async (values) => {
                if (!alias) {
                  toast.error(m.activity_node_alias_required())
                  return
                }
                try {
                  const config = await createCheckIn.mutateAsync({
                    ...values,
                    activityId,
                  })
                  await mountAfterCreate(config.id)
                } catch (err) {
                  if (err instanceof ApiError) toast.error(err.body.error)
                  else toast.error(m.activity_node_create_failed())
                }
              }}
            />
          ) : nodeType === "banner" ? (
            <BannerGroupForm
              submitLabel={m.activity_node_submit_banner()}
              isPending={anyPending}
              onSubmit={async (values) => {
                if (!alias) {
                  toast.error(m.activity_node_alias_required())
                  return
                }
                try {
                  const group = await createBanner.mutateAsync({
                    ...values,
                    activityId,
                  })
                  await mountAfterCreate(group.id)
                } catch (err) {
                  if (err instanceof ApiError) toast.error(err.body.error)
                  else toast.error(m.activity_node_create_failed())
                }
              }}
            />
          ) : nodeType === "lottery" ? (
            <LotteryPoolForm
              defaultValues={{ activityId }}
              isPending={anyPending}
              submitLabel={m.activity_node_submit_lottery()}
              onSubmit={async (values) => {
                if (!alias) {
                  toast.error(m.activity_node_alias_required())
                  return
                }
                try {
                  const pool = await createLottery.mutateAsync({
                    ...values,
                    activityId,
                  })
                  await mountAfterCreate(pool.id)
                } catch (err) {
                  if (err instanceof ApiError) toast.error(err.body.error)
                  else toast.error(m.activity_node_create_failed())
                }
              }}
            />
          ) : nodeType === "task_group" || nodeType === "exchange" ? (
            <RedirectFlow
              nodeType={nodeType}
              activityId={activityId}
              activityKey={activityKey}
              alias={alias}
              orderIndex={orderIndex}
            />
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={anyPending}
          >
            {m.common_cancel()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * For task_group / exchange we can't reasonably inline the full
 * DefinitionForm / ProductForm here (categories, events, rewards, time
 * windows …). Instead we redirect to the module's own create page with
 * `?activityId=<uuid>&returnTo=/activity/<alias>/mount?alias=<node>&orderIndex=N`.
 * The module create page pre-fills activityId, and on success redirects
 * back to a lightweight mount handler that creates the activity_nodes
 * row with `refId` set to the newly created config id.
 */
function RedirectFlow({
  nodeType,
  activityId,
  activityKey,
  alias,
  orderIndex,
}: {
  nodeType: "task_group" | "exchange"
  activityId: string
  activityKey: string
  alias: string
  orderIndex: number
}) {
  const targetPath = nodeType === "task_group" ? "/task/create" : "/shop/create"
  const moduleName =
    nodeType === "task_group"
      ? m.activity_node_redirect_module_task()
      : m.activity_node_redirect_module_shop()
  const canJump = alias.length > 0

  function jump() {
    const returnTo = `/activity/${activityKey}/mount?nodeType=${nodeType}&alias=${encodeURIComponent(
      alias,
    )}&orderIndex=${orderIndex}`
    const url = `${targetPath}?activityId=${activityId}&returnTo=${encodeURIComponent(returnTo)}`
    window.location.href = url
  }

  return (
    <div className="space-y-3 text-sm">
      <p>{m.activity_node_redirect_intro({ module: moduleName })}</p>
      <ol className="ml-5 list-decimal space-y-1 text-muted-foreground">
        <li>{m.activity_node_redirect_step1({ module: moduleName })}</li>
        <li>{m.activity_node_redirect_step2()}</li>
        <li>{m.activity_node_redirect_step3()}</li>
      </ol>
      <Button onClick={jump} disabled={!canJump}>
        {m.activity_node_redirect_button({ module: moduleName })}
      </Button>
      {!canJump ? (
        <p className="text-xs text-destructive">{m.activity_node_alias_required()}</p>
      ) : null}
    </div>
  )
}
