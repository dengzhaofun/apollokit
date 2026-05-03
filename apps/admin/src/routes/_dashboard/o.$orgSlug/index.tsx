import { useQuery } from "@tanstack/react-query"
import { Link, createFileRoute } from "@tanstack/react-router"
import { ArrowRightIcon, FolderKanbanIcon, PlusIcon, UsersIcon } from "lucide-react"

import { Button } from "#/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card"
import { authClient } from "#/lib/auth-client"
import { listTeamsForOrg, projectUrl, resolveOrgBySlug } from "#/lib/tenant"
import { seo } from "#/lib/seo"
import { Skeleton } from "#/components/ui/skeleton"

/**
 * 组织概览页 — 落在 `/o/:orgSlug`。
 *
 * 给多组织用户做"切组织后第一眼能看到什么"的着陆页:
 *   - 当前组织的简介(名/slug/logo)
 *   - 项目数 + 成员数
 *   - 项目卡片网格(点击进项目)
 *   - 跳到组织设置 / 创建新项目
 */
export const Route = createFileRoute("/_dashboard/o/$orgSlug/")({
  head: () => seo({ title: "Organization overview", noindex: true }),
  component: OrgOverviewPage,
})

function OrgOverviewPage() {
  const { orgSlug } = Route.useParams()
  const { data: session } = authClient.useSession()

  const orgQuery = useQuery({
    queryKey: ["org-by-slug", orgSlug] as const,
    queryFn: () => resolveOrgBySlug(orgSlug),
  })

  const teamsQuery = useQuery({
    queryKey: ["org-teams", orgQuery.data?.id] as const,
    enabled: !!orgQuery.data?.id,
    queryFn: () => listTeamsForOrg(orgQuery.data!.id),
  })

  const membersQuery = useQuery({
    queryKey: ["org-members-count", orgQuery.data?.id] as const,
    enabled: !!orgQuery.data?.id && !!session,
    queryFn: async () => {
      const res = await (
        authClient.organization as unknown as {
          listMembers: (args: {
            query: { organizationId: string; limit?: number }
          }) => Promise<{
            data?: { members?: unknown[]; total?: number }
            error?: unknown
          }>
        }
      ).listMembers({
        query: { organizationId: orgQuery.data!.id, limit: 200 },
      })
      const list = res?.data?.members ?? []
      return { count: res?.data?.total ?? list.length }
    },
  })

  const org = orgQuery.data
  const teams = teamsQuery.data ?? []

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {org?.name ?? <Skeleton className="inline-block h-8 w-40 align-middle" />}
        </h1>
        <p className="text-sm text-muted-foreground">
          {org?.slug ? <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{org.slug}</code> : null}
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={FolderKanbanIcon}
          label="项目数"
          value={teamsQuery.isLoading ? null : teams.length}
        />
        <StatCard
          icon={UsersIcon}
          label="成员数"
          value={membersQuery.isLoading ? null : membersQuery.data?.count ?? 0}
        />
        <Card>
          <CardContent className="flex h-full items-center gap-3 p-4">
            <Link
              to="/settings/organization"
              className="flex w-full items-center justify-between gap-2 rounded-md text-sm font-medium hover:underline"
            >
              管理组织设置
              <ArrowRightIcon className="size-4" />
            </Link>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">项目</h2>
          <Button
            variant="outline"
            size="sm"
            render={
              <Link to="/onboarding/create-project">
                <PlusIcon className="size-4" />
                <span>新建项目</span>
              </Link>
            }
          />

        </div>
        {teamsQuery.isLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : teams.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <FolderKanbanIcon className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">该组织下还没有任何项目</p>
              <Button render={<Link to="/onboarding/create-project">创建第一个项目</Link>} />

            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {teams.map((t) => (
              <Card key={t.id} className="transition-colors hover:bg-accent/40">
                <Link
                  to={projectUrl(orgSlug, t.id)}
                  className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <CardHeader className="space-y-1">
                    <CardTitle className="text-base">{t.name}</CardTitle>
                    <CardDescription className="font-mono text-xs">
                      {t.id.slice(0, 8)}…
                    </CardDescription>
                  </CardHeader>
                </Link>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof UsersIcon
  label: string
  value: number | null
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="size-5" />
        </div>
        <div className="flex flex-col">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          {value === null ? (
            <Skeleton className="h-6 w-12" />
          ) : (
            <span className="text-xl font-semibold tabular-nums">{value}</span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
