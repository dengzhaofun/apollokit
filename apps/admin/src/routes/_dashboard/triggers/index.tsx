import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { Plus } from "lucide-react"

import { PageHeaderActions } from "#/components/PageHeader"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "#/components/ui/alert-dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import {
  useArchiveTriggerRule,
  useTriggerRules,
} from "#/hooks/use-triggers"
import type { TriggerRuleStatus } from "#/lib/types/triggers"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/triggers/")({
  component: TriggersListPage,
})

function statusLabel(status: TriggerRuleStatus): string {
  if (status === "active") return m.triggers_status_active()
  if (status === "disabled") return m.triggers_status_disabled()
  return m.triggers_status_archived()
}

function statusVariant(
  status: TriggerRuleStatus,
): "default" | "secondary" | "outline" {
  if (status === "active") return "default"
  if (status === "disabled") return "secondary"
  return "outline"
}

function TriggersListPage() {
  const navigate = useNavigate()
  const { data: rules, isPending, error } = useTriggerRules()
  const archive = useArchiveTriggerRule()

  return (
    <main className="flex-1 space-y-4 p-6">
      <PageHeaderActions>
        <Button onClick={() => navigate({ to: "/triggers/new" })}>
          <Plus className="mr-1 h-4 w-4" />
          {m.triggers_new_rule()}
        </Button>
      </PageHeaderActions>

      <p className="max-w-3xl text-sm text-muted-foreground">
        {m.triggers_description()}
      </p>

      {isPending ? (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          {m.common_loading()}
        </div>
      ) : error ? (
        <div className="flex h-40 items-center justify-center text-destructive">
          {m.triggers_failed_load()} {error.message}
        </div>
      ) : !rules || rules.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          {m.triggers_empty()}
        </div>
      ) : (
        <div className="rounded-xl border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.triggers_col_name()}</TableHead>
                <TableHead>{m.triggers_col_event()}</TableHead>
                <TableHead>{m.triggers_col_status()}</TableHead>
                <TableHead>{m.triggers_col_actions()}</TableHead>
                <TableHead>{m.triggers_col_updated()}</TableHead>
                <TableHead className="w-[160px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="font-medium">
                    <Link
                      to="/triggers/$id"
                      params={{ id: rule.id }}
                      className="hover:underline"
                    >
                      {rule.name}
                    </Link>
                    {rule.description && (
                      <div className="text-xs text-muted-foreground line-clamp-1">
                        {rule.description}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <code className="text-xs rounded bg-muted px-1.5 py-0.5">
                      {rule.triggerEvent}
                    </code>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(rule.status)}>
                      {statusLabel(rule.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>{rule.actions?.length ?? 0}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(rule.updatedAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="space-x-2 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      render={
                        <Link to="/triggers/$id" params={{ id: rule.id }}>
                          {m.triggers_action_edit()}
                        </Link>
                      }
                    />
                    {rule.status !== "archived" && (
                      <AlertDialog>
                        <AlertDialogTrigger
                          render={
                            <Button size="sm" variant="ghost">
                              {m.triggers_action_archive()}
                            </Button>
                          }
                        />
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              {m.triggers_action_archive()}: {rule.name}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              {m.triggers_action_archive_confirm()}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>
                              {m.common_cancel()}
                            </AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => archive.mutate(rule.id)}
                            >
                              {m.triggers_action_archive()}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </main>
  )
}
