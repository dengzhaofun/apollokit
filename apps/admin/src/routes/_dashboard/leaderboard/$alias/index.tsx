import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { format } from "date-fns"
import { ArrowLeft, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { LeaderboardConfigForm } from "#/components/leaderboard/ConfigForm"
import { LeaderboardLivePreview } from "#/components/leaderboard/LivePreview"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import { Separator } from "#/components/ui/separator"
import { SidebarTrigger } from "#/components/ui/sidebar"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "#/components/ui/tabs"
import {
  useDeleteLeaderboardConfig,
  useLeaderboardConfig,
  useLeaderboardSnapshots,
  useUpdateLeaderboardConfig,
} from "#/hooks/use-leaderboard"
import { ApiError } from "#/lib/api-client"

export const Route = createFileRoute("/_dashboard/leaderboard/$alias/")({
  component: LeaderboardDetailPage,
})

function LeaderboardDetailPage() {
  const { alias } = Route.useParams()
  const navigate = useNavigate()
  const { data: config, isPending, error } = useLeaderboardConfig(alias)
  const updateMutation = useUpdateLeaderboardConfig()
  const deleteMutation = useDeleteLeaderboardConfig()
  const { data: snapshots } = useLeaderboardSnapshots(alias)

  if (isPending) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        加载中…
      </div>
    )
  }
  if (error || !config) {
    return (
      <div className="flex h-screen items-center justify-center text-destructive">
        加载失败：{error?.message ?? "未知"}
      </div>
    )
  }

  return (
    <>
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-2 h-4" />
        <Button asChild variant="ghost" size="sm">
          <Link to="/leaderboard">
            <ArrowLeft className="size-4" />
            返回
          </Link>
        </Button>
        <h1 className="text-sm font-semibold">{config.name}</h1>
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
          {config.alias}
        </code>
        <Badge
          variant={config.status === "active" ? "default" : "outline"}
          className="ml-2"
        >
          {config.status}
        </Badge>
        <div className="ml-auto">
          <Button
            variant="destructive"
            size="sm"
            disabled={deleteMutation.isPending}
            onClick={async () => {
              if (!confirm(`确认删除排行榜 "${config.name}"？此操作不可恢复。`))
                return
              try {
                await deleteMutation.mutateAsync(config.id)
                toast.success("已删除")
                navigate({ to: "/leaderboard" })
              } catch (err) {
                if (err instanceof ApiError) toast.error(err.body.error)
                else toast.error("删除失败")
              }
            }}
          >
            <Trash2 className="size-4" />
            删除
          </Button>
        </div>
      </header>

      <main className="flex-1 p-6">
        <Tabs defaultValue="preview" className="mx-auto max-w-4xl">
          <TabsList>
            <TabsTrigger value="preview">实时预览</TabsTrigger>
            <TabsTrigger value="edit">编辑配置</TabsTrigger>
            <TabsTrigger value="snapshots">历史快照</TabsTrigger>
          </TabsList>

          <TabsContent value="preview" className="mt-4">
            <div className="rounded-xl border bg-card p-6 shadow-sm">
              <LeaderboardLivePreview alias={config.alias} />
            </div>
          </TabsContent>

          <TabsContent value="edit" className="mt-4">
            <div className="rounded-xl border bg-card p-6 shadow-sm">
              <LeaderboardConfigForm
                defaultValues={config}
                isPending={updateMutation.isPending}
                submitLabel="保存修改"
                onSubmit={async (values) => {
                  try {
                    const { alias: _alias, ...patch } = values
                    void _alias
                    await updateMutation.mutateAsync({
                      id: config.id,
                      ...patch,
                    })
                    toast.success("已保存")
                  } catch (err) {
                    if (err instanceof ApiError) toast.error(err.body.error)
                    else toast.error("保存失败")
                  }
                }}
              />
            </div>
          </TabsContent>

          <TabsContent value="snapshots" className="mt-4">
            <div className="rounded-xl border bg-card p-6 shadow-sm">
              {!snapshots || snapshots.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground">
                  暂无历史快照
                </div>
              ) : (
                <ul className="flex flex-col gap-3">
                  {snapshots.map((s) => (
                    <li
                      key={s.id}
                      className="flex flex-col gap-1 rounded-lg border p-3"
                    >
                      <div className="flex items-center gap-3 text-sm">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          {s.cycleKey}
                        </code>
                        <span className="text-muted-foreground">
                          scope: {s.scopeKey}
                        </span>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {format(
                            new Date(s.settledAt),
                            "yyyy-MM-dd HH:mm:ss",
                          )}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        前 {s.rankings.length} 名已归档 ·{" "}
                        {s.rewardPlan.length > 0
                          ? `配发 ${s.rewardPlan.length} 档奖励`
                          : "无奖励"}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </>
  )
}
