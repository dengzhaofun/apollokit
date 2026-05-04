import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowRightIcon, FolderKanbanIcon, PlusIcon, Settings2Icon } from "lucide-react"

import { Button } from "#/components/ui/button"
import { Card, CardContent } from "#/components/ui/card"
import { Skeleton } from "#/components/ui/skeleton"
import {
  PageShell,
  PageHeader,
  PageBody,
  PageSection,
  QuickStatRow,
} from "#/components/patterns"
import { authClient } from "#/lib/auth-client"
import { listTeamsForOrg, projectUrl, resolveOrgBySlug } from "#/lib/tenant"
import { seo } from "#/lib/seo"

/**
 * 组织概览页 — 落在 `/o/:orgSlug`。
 * 给多组织用户做"切组织后第一眼能看到什么"的着陆页：
 * 统计速览 + 项目卡片网格 + 跳转设置。
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
    <PageShell>
      <PageHeader
        title={org?.name ?? <Skeleton className="inline-block h-7 w-40 align-middle" />}
        description={
          org?.slug ? (
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              {org.slug}
            </code>
          ) : undefined
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            render={
              <Link to="/settings/organization">
                <Settings2Icon className="size-4" />
                组织设置
              </Link>
            }
          />
        }
      />

      <PageBody>
        <QuickStatRow
          stats={[
            {
              label: "Projects",
              value: teams.length,
              loading: teamsQuery.isLoading,
            },
            {
              label: "Members",
              value: membersQuery.data?.count ?? 0,
              loading: membersQuery.isLoading,
            },
          ]}
        />

        <PageSection
          title="项目"
          actions={
            <Button
              variant="outline"
              size="sm"
              render={
                <Link to="/onboarding/create-project">
                  <PlusIcon className="size-4" />
                  新建项目
                </Link>
              }
            />
          }
        >
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
                <p className="text-sm text-muted-foreground">
                  该组织下还没有任何项目
                </p>
                <Button
                  render={<Link to="/onboarding/create-project">创建第一个项目</Link>}
                />
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
                    <div className="flex items-center gap-3 p-4">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand">
                        <FolderKanbanIcon className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{t.name}</p>
                        <p className="truncate font-mono text-xs text-muted-foreground">
                          {t.id.slice(0, 8)}…
                        </p>
                      </div>
                      <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" />
                    </div>
                  </Link>
                </Card>
              ))}
            </div>
          )}
        </PageSection>
      </PageBody>
    </PageShell>
  )
}
