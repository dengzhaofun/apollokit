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

type Mode = "inline" | "redirect"

const SUPPORTED_TYPES: { value: NodeType; label: string; mode: Mode }[] = [
  { value: "check_in", label: "check_in 签到", mode: "inline" },
  { value: "banner", label: "banner 轮播图", mode: "inline" },
  { value: "lottery", label: "lottery 抽奖池", mode: "inline" },
  {
    value: "task_group",
    label: "task_group 任务组 (跳转任务后台)",
    mode: "redirect",
  },
  {
    value: "exchange",
    label: "exchange 兑换商店 (跳转商店后台)",
    mode: "redirect",
  },
]

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
    toast.success("节点已创建并挂载")
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>新建并挂载子配置</DialogTitle>
          <DialogDescription>
            一步完成：创建底层配置 → 自动挂成活动节点。activityId 会被自动填入对应配置。
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3 py-2">
          <div className="flex flex-col gap-1.5">
            <Label>节点类型</Label>
            <Select
              value={nodeType}
              onValueChange={(v) => setNodeType(v as NodeType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>节点 alias</Label>
            <Input
              value={alias}
              onChange={(e) => setAlias(e.target.value.toLowerCase())}
              placeholder="day7_checkin"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>排序</Label>
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
              submitLabel="创建签到 + 挂成节点"
              onSubmit={async (values) => {
                if (!alias) {
                  toast.error("请先填写节点 alias")
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
                  else toast.error("创建失败")
                }
              }}
            />
          ) : nodeType === "banner" ? (
            <BannerGroupForm
              submitLabel="创建轮播图组 + 挂成节点"
              isPending={anyPending}
              onSubmit={async (values) => {
                if (!alias) {
                  toast.error("请先填写节点 alias")
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
                  else toast.error("创建失败")
                }
              }}
            />
          ) : nodeType === "lottery" ? (
            <LotteryPoolForm
              defaultValues={{ activityId }}
              isPending={anyPending}
              submitLabel="创建抽奖池 + 挂成节点"
              onSubmit={async (values) => {
                if (!alias) {
                  toast.error("请先填写节点 alias")
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
                  else toast.error("创建失败")
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
            取消
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
  const moduleName = nodeType === "task_group" ? "任务" : "商店商品"
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
      <p>
        <strong>{moduleName}</strong>{" "}
        的表单比较复杂（类别/事件/奖励/时间窗等），这里不内嵌。点下面按钮：
      </p>
      <ol className="ml-5 list-decimal space-y-1 text-muted-foreground">
        <li>跳转到 {moduleName}后台的创建页（activityId 已自动预填）</li>
        <li>填完正常提交</li>
        <li>创建成功后自动回到活动节点挂载页，把新建的配置挂成节点</li>
      </ol>
      <Button onClick={jump} disabled={!canJump}>
        去 {moduleName}后台新建 + 自动回挂
      </Button>
      {!canJump ? (
        <p className="text-xs text-destructive">请先填写节点 alias</p>
      ) : null}
    </div>
  )
}
