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
import { confirm } from "#/components/patterns"
import { PageHeaderActions } from "#/components/PageHeader"
import * as m from "#/paraglide/messages.js"
import { getLocale } from "#/paraglide/runtime.js"

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
            {m.activity_template_back_to_list()}
          </Link>
        </Button>
        <div className="ml-auto">
          <Button asChild size="sm">
            <Link to="/activity/templates/create">
              <Plus className="size-4" />
              {m.activity_template_new()}
            </Link>
          </Button>
        </div>
      </PageHeaderActions>

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-xl border bg-card shadow-sm">
            {isPending ? (
              <div className="flex h-40 items-center justify-center text-muted-foreground">
                {m.common_loading()}
              </div>
            ) : error ? (
              <div className="flex h-40 items-center justify-center text-destructive">
                {m.common_failed_to_load({
                  resource: m.activity_action_templates(),
                  error: error.message,
                })}
              </div>
            ) : !templates || templates.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-muted-foreground">
                {m.activity_template_empty()}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{m.common_name()}</TableHead>
                    <TableHead>{m.common_alias()}</TableHead>
                    <TableHead>{m.activity_template_col_recurrence()}</TableHead>
                    <TableHead>{m.activity_template_col_next_at()}</TableHead>
                    <TableHead>{m.activity_template_col_last_alias()}</TableHead>
                    <TableHead>{m.common_status()}</TableHead>
                    <TableHead className="w-44">{m.common_actions()}</TableHead>
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
                          {t.enabled ? m.common_active() : m.common_inactive()}
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
                              toast.success(
                                m.activity_template_instantiate_success({
                                  alias: r.activityAlias,
                                }),
                              )
                            } catch (err) {
                              if (err instanceof ApiError)
                                toast.error(err.body.error)
                              else toast.error(m.activity_template_instantiate_failed())
                            }
                          }}
                        >
                          <Rocket className="size-4" />
                          {m.activity_template_instantiate()}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            const ok = await confirm({
                              title: getLocale() === "zh" ? "删除模板?" : "Delete template?",
                              description: m.activity_template_delete_confirm({ alias: t.alias }),
                              confirmLabel: m.common_delete(),
                              danger: true,
                            })
                            if (!ok) return
                            try {
                              await deleteMutation.mutateAsync(t.id)
                              toast.success(m.activity_template_delete_success())
                            } catch (err) {
                              if (err instanceof ApiError)
                                toast.error(err.body.error)
                              else toast.error(m.activity_template_delete_failed())
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
