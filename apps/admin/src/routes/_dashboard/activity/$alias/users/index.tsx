import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, Search } from "lucide-react"
import { useState } from "react"

import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { PageHeaderActions } from "#/components/PageHeader"
export const Route = createFileRoute("/_dashboard/activity/$alias/users/")({
  component: ActivityUsersIndexPage,
})

function ActivityUsersIndexPage() {
  const { alias } = Route.useParams()
  const navigate = useNavigate()
  const [endUserId, setEndUserId] = useState("")

  return (
    <>
      <PageHeaderActions>
        <Button asChild variant="ghost" size="sm">
          <Link to="/activity/$alias" params={{ alias }}>
            <ArrowLeft className="size-4" />
            返回活动详情
          </Link>
        </Button>
      </PageHeaderActions>

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-2xl rounded-xl border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold">
            输入玩家 endUserId 查询聚合视图
          </h2>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              const id = endUserId.trim()
              if (!id) return
              navigate({
                to: "/activity/$alias/users/$endUserId",
                params: { alias, endUserId: id },
              })
            }}
          >
            <Input
              value={endUserId}
              onChange={(e) => setEndUserId(e.target.value)}
              placeholder="玩家业务 id (endUserId)"
              className="flex-1"
            />
            <Button type="submit" disabled={!endUserId.trim()}>
              <Search className="size-4" />
              查询
            </Button>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">
            输入 SaaS 租户侧的业务用户 id。会一次性拉取该玩家在本活动的:
            进度 / 积分 / 已领里程碑 / 各节点解锁状态。
          </p>
        </div>
      </main>
    </>
  )
}
