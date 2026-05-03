import { useQuery } from "@tanstack/react-query"
import { Link, createFileRoute } from "@tanstack/react-router"
import {
  ActivityIcon,
  ArrowRightIcon,
  CopyIcon,
  KeyRoundIcon,
  MailPlusIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Avatar, AvatarFallback } from "#/components/ui/avatar"
import { Button } from "#/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card"
import { Skeleton } from "#/components/ui/skeleton"
import { resolveOrgBySlug, resolveTeamBySlug } from "#/lib/tenant"
import { seo } from "#/lib/seo"

/**
 * 项目概览页 —— `/o/:orgSlug/p/:projectSlug`。
 *
 * Sentry 风格 Hero + 关键指标 + 快速操作。具体 stat 的真实数据
 * (今日 API 请求 / 24h 活跃 / 最近事件)在后续 PR 接 Tinybird;
 * 当前先用 placeholder + 项目元数据,保证页面骨架可用。
 */
export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/")({
  head: () => seo({ title: "Project overview", noindex: true }),
  component: ProjectOverviewPage,
})

function ProjectOverviewPage() {
  const { orgSlug, projectSlug } = Route.useParams()
  const orgQuery = useQuery({
    queryKey: ["org-by-slug", orgSlug] as const,
    queryFn: () => resolveOrgBySlug(orgSlug),
  })
  const teamQuery = useQuery({
    queryKey: ["team-by-slug", orgQuery.data?.id, projectSlug] as const,
    enabled: !!orgQuery.data?.id,
    queryFn: () => resolveTeamBySlug(orgQuery.data!.id, projectSlug),
  })

  const team = teamQuery.data
  const teamName = team?.name ?? ""
  const initials = (teamName || "?").slice(0, 2).toUpperCase()

  const copyId = async () => {
    if (!team) return
    try {
      await navigator.clipboard.writeText(team.id)
      toast.success("已复制项目 ID")
    } catch {
      toast.error("复制失败")
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 p-6">
      <Card>
        <CardContent className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar size="lg">
              <AvatarFallback className="bg-gradient-to-br from-violet-500/20 to-fuchsia-500/10 text-base font-semibold text-violet-600">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight">
                {teamName || <Skeleton className="inline-block h-8 w-40" />}
              </h1>
              <p className="text-sm text-muted-foreground">
                {team ? (
                  <>
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                      {team.id}
                    </code>
                  </>
                ) : null}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={copyId} disabled={!team}>
              <CopyIcon className="size-4" />
              复制项目 ID
            </Button>
            <Button
              variant="outline"
              size="sm"
              render={
                <Link to="/settings/api-keys">
                  <KeyRoundIcon className="size-4" />
                  <span>API 密钥</span>
                </Link>
              }
            />
            <Button
              variant="outline"
              size="sm"
              render={
                <Link to="/settings/organization">
                  <MailPlusIcon className="size-4" />
                  <span>邀请成员</span>
                </Link>
              }
            />
          </div>
        </CardContent>
      </Card>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="成员" valueLabel={<MemberCount teamId={team?.id} />} />
        <StatCard label="今日 API 请求" valueLabel={<span className="text-muted-foreground">—</span>} />
        <StatCard label="24h 活跃用户" valueLabel={<span className="text-muted-foreground">—</span>} />
        <StatCard label="最近事件" valueLabel={<span className="text-muted-foreground">—</span>} />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Quickstart</CardTitle>
            <CardDescription>
              将 SDK 接入到你的客户端 / 服务,事件数据自动归属到当前项目。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              SDK 接入指南详见 <a href="/docs" className="text-primary underline-offset-4 hover:underline">文档中心</a>。
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ActivityIcon className="size-4" />
              最近活动
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              暂无活动数据。
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 -ml-2"
              render={
                <Link to="/audit-logs">
                  <span>查看全部审计日志</span>
                  <ArrowRightIcon className="size-4" />
                </Link>
              }
            />
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

function StatCard({
  label,
  valueLabel,
}: {
  label: string
  valueLabel: React.ReactNode
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-4">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className="text-2xl font-semibold tabular-nums">{valueLabel}</span>
      </CardContent>
    </Card>
  )
}

function MemberCount({ teamId }: { teamId: string | undefined }) {
  const { data, isLoading } = useQuery({
    queryKey: ["project-member-count", teamId] as const,
    enabled: !!teamId,
    queryFn: async () => {
      // Better Auth 当前没有 list-team-members 内置 endpoint(team 级成员
      // 用 teamMember 表,我们后续在 PR 4 加自家 endpoint)。这里先暂用
      // 0 占位,等后端就绪后切到 use-project-members hook。
      return { count: 0 }
    },
  })
  if (isLoading) return <Skeleton className="h-7 w-12" />
  return <>{data?.count ?? 0}</>
}
