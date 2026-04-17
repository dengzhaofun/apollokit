import { createFileRoute, Link } from "@tanstack/react-router"
import { format, formatDistanceToNow } from "date-fns"
import { ArrowLeft } from "lucide-react"

import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import { Separator } from "#/components/ui/separator"
import { SidebarTrigger } from "#/components/ui/sidebar"
import { useActivityForUser } from "#/hooks/use-activity"

export const Route = createFileRoute(
  "/_dashboard/activity/$alias/users/$endUserId/",
)({
  component: ActivityUserDetailPage,
})

function ActivityUserDetailPage() {
  const { alias, endUserId } = Route.useParams()
  const { data, isPending, error } = useActivityForUser(alias, endUserId)

  if (isPending) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        加载中…
      </div>
    )
  }
  if (error) {
    return (
      <div className="flex h-screen items-center justify-center text-destructive">
        加载失败：{error.message}
      </div>
    )
  }
  if (!data) return null

  const { activity, progress, nodes } = data
  const joined = progress != null

  return (
    <>
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-2 h-4" />
        <Button asChild variant="ghost" size="sm">
          <Link to="/activity/$alias/users" params={{ alias }}>
            <ArrowLeft className="size-4" />
            返回
          </Link>
        </Button>
        <h1 className="text-sm font-semibold">
          {activity.name} · 玩家{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
            {endUserId}
          </code>
        </h1>
        <Badge className="ml-2">{activity.derivedState}</Badge>
      </header>

      <main className="flex-1 space-y-4 p-6">
        <div className="mx-auto grid max-w-4xl gap-4">
          {/* Overview */}
          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold">总览</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">参与状态: </span>
                {joined ? (
                  <Badge variant="default">已加入</Badge>
                ) : (
                  <Badge variant="outline">未加入</Badge>
                )}
              </div>
              <div>
                <span className="text-muted-foreground">活动状态: </span>
                <code className="rounded bg-muted px-1 text-xs">
                  {activity.derivedState}
                </code>
              </div>
              {joined ? (
                <>
                  <div>
                    <span className="text-muted-foreground">活动积分: </span>
                    <span className="font-mono">
                      {progress!.activityPoints.toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">参与进度: </span>
                    <Badge variant="outline">{progress!.status}</Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground">加入时间: </span>
                    {format(new Date(progress!.joinedAt), "yyyy-MM-dd HH:mm:ss")}
                  </div>
                  <div>
                    <span className="text-muted-foreground">最后活动: </span>
                    {formatDistanceToNow(new Date(progress!.lastActiveAt), {
                      addSuffix: true,
                    })}
                  </div>
                  {progress!.completedAt ? (
                    <div>
                      <span className="text-muted-foreground">完成时间: </span>
                      {format(
                        new Date(progress!.completedAt),
                        "yyyy-MM-dd HH:mm:ss",
                      )}
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>

          {/* Milestones */}
          {joined ? (
            <div className="rounded-xl border bg-card p-6 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold">里程碑进度</h2>
              {activity.milestoneTiers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  本活动无里程碑配置
                </p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {activity.milestoneTiers.map((tier) => {
                    const done = progress!.milestonesAchieved.includes(
                      tier.alias,
                    )
                    const reached = progress!.activityPoints >= tier.points
                    return (
                      <li
                        key={tier.alias}
                        className="flex items-center gap-3 rounded-lg border p-3"
                      >
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          {tier.alias}
                        </code>
                        <span className="text-muted-foreground">
                          {tier.points.toLocaleString()} 分
                        </span>
                        {done ? (
                          <Badge variant="default" className="ml-auto">
                            已领取
                          </Badge>
                        ) : reached ? (
                          <Badge variant="secondary" className="ml-auto">
                            可领取
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="ml-auto">
                            未达成（
                            {(
                              tier.points - progress!.activityPoints
                            ).toLocaleString()}{" "}
                            差距）
                          </Badge>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          ) : null}

          {/* Nodes */}
          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold">节点解锁状态</h2>
            {nodes.length === 0 ? (
              <p className="text-sm text-muted-foreground">本活动无节点</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {nodes.map(
                  ({ node, unlocked, effectiveEnabled, resourceActive }) => (
                    <li
                      key={node.id}
                      className="flex items-center gap-3 rounded-lg border p-3"
                    >
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        {node.alias}
                      </code>
                      <Badge variant="outline">{node.nodeType}</Badge>
                      <span className="text-xs text-muted-foreground">
                        order: {node.orderIndex}
                      </span>
                      {!effectiveEnabled ? (
                        <Badge variant="outline" className="ml-auto">
                          对玩家不可见
                          {!node.enabled && !resourceActive
                            ? "（节点+资源均停用）"
                            : !node.enabled
                              ? "（节点停用）"
                              : "（底层资源停用）"}
                        </Badge>
                      ) : (
                        <Badge
                          variant={unlocked ? "default" : "outline"}
                          className="ml-auto"
                        >
                          {unlocked ? "已解锁" : "未解锁"}
                        </Badge>
                      )}
                    </li>
                  ),
                )}
              </ul>
            )}
          </div>

          {/* Node state raw JSON */}
          {joined && Object.keys(progress!.nodeState).length > 0 ? (
            <div className="rounded-xl border bg-card p-6 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold">
                节点运行时状态 (raw)
              </h2>
              <pre className="max-h-80 overflow-auto rounded-lg bg-muted p-3 text-xs">
                {JSON.stringify(progress!.nodeState, null, 2)}
              </pre>
            </div>
          ) : null}
        </div>
      </main>
    </>
  )
}
