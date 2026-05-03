import { createFileRoute, Link } from "@tanstack/react-router"
import { Medal as MedalIcon, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import {
  confirm,
  EmptyList,
  ErrorState,
  PageBody,
  PageHeader,
  PageShell,
} from "#/components/patterns"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import { useDeleteLevelConfig, useLevelConfigs } from "#/hooks/use-level"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/level/")({
  component: LevelListPage,
})

function LevelListPage() {
  const { data: items, isPending, error, refetch } = useLevelConfigs()
  const deleteMutation = useDeleteLevelConfig()
  const total = items?.length ?? 0

  return (
    <PageShell>
      <PageHeader
        icon={<MedalIcon className="size-5" />}
        title={t("等级配置", "Level configs")}
        description={
          isPending
            ? t("加载中…", "Loading…")
            : error
              ? t("加载失败", "Failed to load")
              : t(`共 ${total} 个等级体系`, `${total} configs total`)
        }
        actions={
          <Button
            render={
              <Link to="/level/create">
                <Plus />
                {m.level_new_config()}
              </Link>
            }
            size="sm"
          />
        }
      />

      <PageBody>
        {isPending ? (
          <div className="flex h-40 items-center justify-center rounded-lg border bg-card text-muted-foreground">
            {m.common_loading()}
          </div>
        ) : error ? (
          <ErrorState
            title={t("等级配置加载失败", "Failed to load level configs")}
            onRetry={() => refetch()}
            retryLabel={t("重试", "Retry")}
            error={error instanceof Error ? error : null}
          />
        ) : total === 0 ? (
          <EmptyList
            title={t("还没有等级配置", "No level configs yet")}
            description={t(
              "创建第一个等级体系,定义 stages / levels / 解锁规则。",
              "Create your first level config to define stages and unlock rules.",
            )}
            action={
              <Button
                render={
                  <Link to="/level/create">
                    <Plus />
                    {m.level_new_config()}
                  </Link>
                }
                size="sm"
              />
            }
          />
        ) : (
          <div className="rounded-lg border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{m.level_col_name()}</TableHead>
                  <TableHead>{m.level_col_alias()}</TableHead>
                  <TableHead>{m.level_col_has_stages()}</TableHead>
                  <TableHead>{m.common_status()}</TableHead>
                  <TableHead>{m.common_sort_order()}</TableHead>
                  <TableHead className="text-right">
                    {m.common_actions()}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items!.map((cfg) => (
                  <TableRow key={cfg.id}>
                    <TableCell className="font-medium">
                      <Link
                        to="/level/$configId"
                        params={{ configId: cfg.id }}
                        className="hover:underline"
                      >
                        {cfg.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {cfg.alias ?? m.common_dash()}
                    </TableCell>
                    <TableCell>
                      {cfg.hasStages ? (
                        <Badge variant="secondary">{m.common_yes()}</Badge>
                      ) : (
                        m.common_no()
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={cfg.isActive ? "default" : "outline"}>
                        {cfg.isActive
                          ? m.common_active()
                          : m.common_inactive()}
                      </Badge>
                    </TableCell>
                    <TableCell>{cfg.sortOrder}</TableCell>
                    <TableCell className="flex justify-end gap-2">
                      <Button
                        render={
                          <Link
                            to="/level/$configId"
                            params={{ configId: cfg.id }}
                          >
                            {m.common_edit()}
                          </Link>
                        }
                        variant="outline" size="sm"
                      />
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={deleteMutation.isPending}
                        onClick={async () => {
                          const ok = await confirm({
                            title: t("删除等级配置?", "Delete level config?"),
                            description: t(
                              `配置 "${cfg.name}" 删除后,关联的 stages / levels / 玩家进度都会丢失。`,
                              `Config "${cfg.name}" will lose all stages, levels, and player progress.`,
                            ),
                            confirmLabel: m.common_delete(),
                            danger: true,
                          })
                          if (!ok) return
                          try {
                            await deleteMutation.mutateAsync(cfg.id)
                            toast.success(m.level_config_deleted())
                          } catch (err) {
                            if (err instanceof ApiError)
                              toast.error(err.body.error)
                            else toast.error(m.level_failed_delete())
                          }
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </PageBody>
    </PageShell>
  )
}
