import { createFileRoute, Link } from "@tanstack/react-router"
import { format } from "date-fns"
import { ArrowLeft, Plus, Rocket, Trash2 } from "lucide-react"
import { toast } from "sonner"

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
import {
  useActivityTemplates,
  useDeleteActivityTemplate,
  useInstantiateActivityTemplate,
} from "#/hooks/use-activity"
import { ApiError } from "#/lib/api-client"
import { PageHeaderActions } from "#/components/PageHeader"

export const Route = createFileRoute("/_dashboard/activity/templates/")({
  component: ActivityTemplatesPage,
})

function ActivityTemplatesPage() {
  const { data: templates, isPending, error } = useActivityTemplates()
  const deleteMutation = useDeleteActivityTemplate()
  const instantiateMutation = useInstantiateActivityTemplate()

  return (
    <>
      <PageHeaderActions>
        <Button asChild variant="ghost" size="sm">
          <Link to="/activity">
            <ArrowLeft className="size-4" />
            返回活动列表
          </Link>
        </Button>
        <div className="ml-auto">
          <Button asChild size="sm">
            <Link to="/activity/templates/create">
              <Plus className="size-4" />
              新建模板
            </Link>
          </Button>
        </div>
      </PageHeaderActions>

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-xl border bg-card shadow-sm">
            {isPending ? (
              <div className="flex h-40 items-center justify-center text-muted-foreground">
                加载中…
              </div>
            ) : error ? (
              <div className="flex h-40 items-center justify-center text-destructive">
                加载失败：{error.message}
              </div>
            ) : !templates || templates.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-muted-foreground">
                暂无模板
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>名称</TableHead>
                    <TableHead>别名</TableHead>
                    <TableHead>周期</TableHead>
                    <TableHead>下一期时间</TableHead>
                    <TableHead>上一期 alias</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="w-44">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell>
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          {t.alias}
                        </code>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{t.recurrence.mode}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {t.nextInstanceAt
                          ? format(
                              new Date(t.nextInstanceAt),
                              "yyyy-MM-dd HH:mm",
                            )
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {t.lastInstantiatedAlias ? (
                          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                            {t.lastInstantiatedAlias}
                          </code>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={t.enabled ? "default" : "outline"}>
                          {t.enabled ? "启用" : "停用"}
                        </Badge>
                      </TableCell>
                      <TableCell className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={instantiateMutation.isPending}
                          onClick={async () => {
                            try {
                              const r = await instantiateMutation.mutateAsync(
                                t.id,
                              )
                              toast.success(`已生成: ${r.activityAlias}`)
                            } catch (err) {
                              if (err instanceof ApiError)
                                toast.error(err.body.error)
                              else toast.error("生成失败")
                            }
                          }}
                        >
                          <Rocket className="size-4" />
                          生成下一期
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            if (!confirm(`删除模板 "${t.alias}"？`)) return
                            try {
                              await deleteMutation.mutateAsync(t.id)
                              toast.success("已删除")
                            } catch (err) {
                              if (err instanceof ApiError)
                                toast.error(err.body.error)
                              else toast.error("删除失败")
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
            )}
          </div>
        </div>
      </main>
    </>
  )
}
