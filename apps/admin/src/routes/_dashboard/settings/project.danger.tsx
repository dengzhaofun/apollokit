import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "sonner"

import { RouteGuard } from "#/components/auth/RouteGuard"
import { SettingsPageHeader } from "#/components/settings/SettingsPageHeader"
import { Button } from "#/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { authClient } from "#/lib/auth-client"
import { invalidateTenantCache } from "#/lib/tenant"
import { seo } from "#/lib/seo"

/**
 * 项目 → 危险区 (`/settings/project/danger`)。
 *
 * 删除当前 active project,会一并清掉该项目下所有作用域数据
 * (活动 / 物品 / 玩家 / 审计日志 / API key / Webhook ...)。
 * 必须输入项目名 / id 完全匹配。
 */
export const Route = createFileRoute("/_dashboard/settings/project/danger")({
  head: () => seo({ title: "Project danger zone", noindex: true }),
  component: ProjectDangerPage,
})

function ProjectDangerPage() {
  return (
    <RouteGuard
      resource="team"
      action="delete"
      visibility="unauthorized-page"
    >
      <div className="mx-auto w-full max-w-3xl">
        <SettingsPageHeader
          title="项目危险区"
          description="不可逆操作。请确认你真的清楚自己在做什么。"
        />
        <DeleteProjectCard />
      </div>
    </RouteGuard>
  )
}

function DeleteProjectCard() {
  const queryClient = useQueryClient()
  const { data: session } = authClient.useSession()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState("")

  const orgId = session?.session.activeOrganizationId ?? null
  const teamId = session?.session.activeTeamId ?? null

  const team = useQuery({
    queryKey: ["active-team-detail", orgId, teamId] as const,
    enabled: Boolean(orgId && teamId),
    queryFn: async () => {
      const res = await (
        authClient.organization as unknown as {
          listTeams: (args: {
            query: { organizationId: string }
          }) => Promise<{
            data?: { id: string; name: string }[] | null
          }>
        }
      ).listTeams({ query: { organizationId: orgId! } })
      const list = res?.data ?? []
      return list.find((t) => t.id === teamId) ?? null
    },
  })

  const projectName = team.data?.name ?? ""

  const del = useMutation({
    mutationFn: async () => {
      if (!teamId) throw new Error("没有活动项目")
      const { error } = await (
        authClient.organization as unknown as {
          removeTeam: (args: {
            teamId: string
          }) => Promise<{ error?: { message?: string } | null }>
        }
      ).removeTeam({ teamId })
      if (error) throw new Error(error.message ?? "删除失败")
    },
    onSuccess: async () => {
      toast.success("项目已删除")
      invalidateTenantCache()
      await queryClient.invalidateQueries()
      setOpen(false)
      // server hook 会自动选剩余 team 的第一个;若没有,_dashboard 守卫
      // 会跳到 onboarding。让 router 重抓 session 后做对应跳转。
      await navigate({ to: "/" })
      window.location.reload()
    },
    onError: (err) => toast.error(err.message),
  })

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive">删除项目</CardTitle>
        <CardDescription>
          永久删除当前项目及其所有作用域数据 ——
          活动、物品、玩家、审计日志、API 密钥、Webhook。此操作不可撤销。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p>删除前请确认:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>已停用所有 SDK 上报与 webhook 接收方</li>
          <li>已通知所有项目成员</li>
          <li>已导出所需数据</li>
        </ul>
      </CardContent>
      <CardFooter className="border-t pt-4">
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v)
            if (!v) setConfirm("")
          }}
        >
          <DialogTrigger
            render={
              <Button
                variant="destructive"
                className="ml-auto"
                disabled={!team.data}
              >
                删除项目
              </Button>
            }
          />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>确定删除 &ldquo;{projectName}&rdquo;?</DialogTitle>
              <DialogDescription>
                请输入项目名称 <b>{projectName}</b> 完全确认。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="confirm-name">项目名称</Label>
              <Input
                id="confirm-name"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={projectName}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                取消
              </Button>
              <Button
                variant="destructive"
                disabled={confirm !== projectName || del.isPending}
                onClick={() => del.mutate()}
              >
                {del.isPending ? "删除中…" : "永久删除"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardFooter>
    </Card>
  )
}
