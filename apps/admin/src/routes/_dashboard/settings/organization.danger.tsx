import { useMutation } from "@tanstack/react-query"
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
 * 组织 → 危险区 (`/settings/organization/danger`)。
 *
 * 删除组织 —— 不可逆,会一并清掉该 org 下所有 team / 项目数据。
 * 必须输入 org slug 字符串完全匹配才放开按钮。
 *
 * 转让所有权(transfer ownership)留待后续:Better Auth member 表的
 * role 改成 owner 即可,但需要先选定接收人,UX 复杂,放后续 PR。
 */
export const Route = createFileRoute("/_dashboard/settings/organization/danger")({
  head: () => seo({ title: "Danger zone", noindex: true }),
  component: OrgDangerPage,
})

function OrgDangerPage() {
  return (
    <RouteGuard
      resource="organization"
      action="delete"
      visibility="unauthorized-page"
    >
      <div className="mx-auto w-full max-w-3xl">
        <SettingsPageHeader
          title="危险区"
          description="不可逆操作。请确认你真的清楚自己在做什么。"
        />
        <DeleteOrgCard />
      </div>
    </RouteGuard>
  )
}

function DeleteOrgCard() {
  const { data: session } = authClient.useSession()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState("")
  const orgId = session?.session.activeOrganizationId ?? null

  const orgQuery = useMutation({
    // 用 mutation 包裹一次性获取,简化样板;实际只是 list + find。
    mutationFn: async () => {
      const res = await authClient.organization.list()
      const list = (res?.data ?? []) as { id: string; name: string; slug: string }[]
      return list.find((o) => o.id === orgId) ?? null
    },
  })
  const [orgInfo, setOrgInfo] = useState<{ name: string; slug: string } | null>(
    null,
  )

  const ensureOrgInfo = async () => {
    if (orgInfo) return orgInfo
    const r = await orgQuery.mutateAsync()
    if (r) {
      setOrgInfo({ name: r.name, slug: r.slug })
      return { name: r.name, slug: r.slug }
    }
    return null
  }

  const del = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("没有活动组织")
      const { error } = await authClient.organization.delete({
        organizationId: orgId,
      })
      if (error) throw new Error(error.message ?? "删除失败")
    },
    onSuccess: async () => {
      toast.success("组织已删除")
      invalidateTenantCache()
      setOpen(false)
      // 让 _dashboard 守卫重定向到 onboarding 或其它 org
      await navigate({ to: "/" })
      window.location.reload()
    },
    onError: (err) => toast.error(err.message),
  })

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive">删除组织</CardTitle>
        <CardDescription>
          永久删除该组织及其下属的所有项目、成员、密钥与数据。此操作不可撤销。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p>删除前请确认:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>没有未结清的账单或活跃订阅</li>
          <li>已通知所有成员</li>
          <li>已导出所需数据(审计日志 / 玩家数据)</li>
        </ul>
      </CardContent>
      <CardFooter className="border-t pt-4">
        <Dialog
          open={open}
          onOpenChange={async (v) => {
            setOpen(v)
            if (v) await ensureOrgInfo()
            else setConfirm("")
          }}
        >
          <DialogTrigger
            render={
              <Button variant="destructive" className="ml-auto">
                删除组织
              </Button>
            }
          />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>确定删除 &ldquo;{orgInfo?.name ?? "..."}&rdquo;?</DialogTitle>
              <DialogDescription>
                请输入组织 slug <code>{orgInfo?.slug ?? "..."}</code> 完全确认。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="confirm-slug">组织 slug</Label>
              <Input
                id="confirm-slug"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={orgInfo?.slug ?? ""}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                取消
              </Button>
              <Button
                variant="destructive"
                disabled={
                  !orgInfo ||
                  confirm !== orgInfo.slug ||
                  del.isPending
                }
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
