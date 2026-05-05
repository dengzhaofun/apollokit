/**
 * 跨活动榜 —— 一表对比所有活动的运营指标。
 *
 * v1 数据源完全是后端 PG 聚合（Endpoint A）：参与 / 完成 / 流失 / 积分 / 奖励
 * 都来自 activity_members + activity_user_rewards 的 JOIN 聚合。
 * `active24h` 列在 v1 留 null（v2 接 Tinybird fan-out by activity_id）。
 */

import { createFileRoute, Link } from "@tanstack/react-router"
import { ListChecks } from "lucide-react"
import { useState } from "react"

import {
  PageBody,
  PageHeader,
  PageSection,
  PageShell,
} from "#/components/patterns"
import { Badge } from "#/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import { useTenantParams } from "#/hooks/use-tenant-params"
import { useActivitiesSummary } from "#/hooks/use-activity"
import * as m from "#/paraglide/messages.js"

const STATUS_OPTIONS = [
  "all",
  "draft",
  "scheduled",
  "teasing",
  "active",
  "ended",
  "archived",
] as const

export const Route = createFileRoute(
  "/_dashboard/o/$orgSlug/p/$projectSlug/analytics/activities/",
)({
  component: ActivitiesAnalyticsPage,
})

function ActivitiesAnalyticsPage() {
  const { orgSlug, projectSlug } = useTenantParams()
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]>("all")
  const query = useActivitiesSummary({
    status: status === "all" ? undefined : status,
    limit: 100,
  })

  const items = query.data?.items ?? []

  return (
    <PageShell>
      <PageHeader
        icon={<ListChecks className="size-5" />}
        title={m.analytics_activities_title()}
        description={m.analytics_activities_subtitle()}
      />
      <PageBody>
        <PageSection>
          <div className="flex items-center justify-end gap-2 pb-3">
            <span className="text-xs text-muted-foreground">
              {m.analytics_activities_status_filter()}
            </span>
            <Select
              value={status}
              onValueChange={(v) =>
                setStatus(
                  ((v ?? "all") as (typeof STATUS_OPTIONS)[number]) ?? "all",
                )
              }
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s === "all" ? m.analytics_activities_status_all() : s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {query.isPending ? (
            <div className="text-muted-foreground">{m.common_loading()}</div>
          ) : query.error ? (
            <div className="text-destructive">
              {m.common_failed_to_load({
                resource: m.analytics_activities_title(),
                error: query.error.message,
              })}
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-md border border-dashed bg-muted/30 px-3 py-12 text-center text-sm text-muted-foreground">
              {m.analytics_activities_empty()}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[28%]">
                    {m.analytics_activities_col_name()}
                  </TableHead>
                  <TableHead>{m.analytics_activities_col_status()}</TableHead>
                  <TableHead>{m.analytics_activities_col_kind()}</TableHead>
                  <TableHead className="text-right">
                    {m.analytics_activities_col_participants()}
                  </TableHead>
                  <TableHead className="text-right">
                    {m.analytics_activities_col_completion()}
                  </TableHead>
                  <TableHead className="text-right">
                    {m.analytics_activities_col_points()}
                  </TableHead>
                  <TableHead className="text-right">
                    {m.analytics_activities_col_rewards()}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row) => (
                  <TableRow key={row.activityId}>
                    <TableCell>
                      <Link
                        to="/o/$orgSlug/p/$projectSlug/activity/$alias"
                        params={{
                          orgSlug,
                          projectSlug,
                          alias: row.alias,
                        }}
                        className="block hover:underline"
                      >
                        <div className="font-medium">{row.name}</div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {row.alias}
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.kind}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {row.participants.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.participants === 0
                        ? "—"
                        : `${(row.completionRate * 100).toFixed(1)}%`}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {row.totalPointsGranted.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {row.totalRewardsGranted.toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </PageSection>
      </PageBody>
    </PageShell>
  )
}
