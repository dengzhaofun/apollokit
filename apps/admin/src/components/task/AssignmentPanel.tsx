import { useState } from "react"
import { toast } from "sonner"
import { Trash2 } from "lucide-react"

import * as m from "#/paraglide/messages.js"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { Textarea } from "#/components/ui/textarea"
import { Switch } from "#/components/ui/switch"
import { Badge } from "#/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import {
  useAssignTask,
  useRevokeAssignment,
  useTaskAssignments,
} from "#/hooks/use-task"
import { ApiError } from "#/lib/api-client"
import type { TaskDefinition } from "#/lib/types/task"

interface AssignmentPanelProps {
  definition: TaskDefinition
}

export function AssignmentPanel({ definition }: AssignmentPanelProps) {
  const taskKey = definition.id
  const [activeOnly, setActiveOnly] = useState(true)
  const [userIdsText, setUserIdsText] = useState("")
  const [ttlInput, setTtlInput] = useState("")
  const [sourceRef, setSourceRef] = useState("")
  const [allowReassign, setAllowReassign] = useState(false)

  const {
    data: assignments,
    isPending,
    error,
  } = useTaskAssignments(taskKey, { activeOnly, limit: 200 })
  const assignMutation = useAssignTask(taskKey)
  const revokeMutation = useRevokeAssignment(taskKey)

  const parsedIds = userIdsText
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)

  const isAssigned = definition.visibility === "assigned"

  async function handleAssign() {
    if (parsedIds.length === 0) return
    const ttl = ttlInput.trim()
    const ttlSeconds = ttl ? Number(ttl) : undefined
    if (ttl && (!Number.isFinite(ttlSeconds) || (ttlSeconds ?? 0) <= 0)) {
      toast.error(m.task_assign_invalid_ttl())
      return
    }
    try {
      const res = await assignMutation.mutateAsync({
        endUserIds: parsedIds,
        ttlSeconds,
        sourceRef: sourceRef.trim() || null,
        allowReassign,
      })
      toast.success(
        m.task_assign_success({
          assigned: res.assigned,
          skipped: res.skipped,
        }),
      )
      setUserIdsText("")
      setSourceRef("")
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.body.error)
      else toast.error(m.task_assign_failed())
    }
  }

  async function handleRevoke(endUserId: string) {
    if (!confirm(m.task_assign_revoke_confirm({ endUserId }))) return
    try {
      await revokeMutation.mutateAsync(endUserId)
      toast.success(m.task_assign_revoked())
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.body.error)
      else toast.error(m.task_assign_revoke_failed())
    }
  }

  return (
    <div className="space-y-6">
      {!isAssigned && (
        <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-4 text-sm">
          {m.task_assign_broadcast_notice()}
        </div>
      )}

      <section className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <div>
          <h2 className="text-base font-semibold">{m.task_assign_new()}</h2>
          <p className="text-xs text-muted-foreground">
            {m.task_assign_new_hint()}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="assign-user-ids">{m.task_assign_user_ids()}</Label>
          <Textarea
            id="assign-user-ids"
            value={userIdsText}
            onChange={(e) => setUserIdsText(e.target.value)}
            rows={4}
            placeholder={m.task_assign_user_ids_placeholder()}
          />
          <p className="text-xs text-muted-foreground">
            {m.task_assign_user_ids_count({ count: parsedIds.length })}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="assign-ttl">{m.task_assign_ttl_label()}</Label>
            <Input
              id="assign-ttl"
              type="number"
              min={1}
              value={ttlInput}
              onChange={(e) => setTtlInput(e.target.value)}
              placeholder={
                definition.defaultAssignmentTtlSeconds
                  ? String(definition.defaultAssignmentTtlSeconds)
                  : m.task_assign_ttl_placeholder()
              }
            />
            <p className="text-xs text-muted-foreground">
              {m.task_assign_ttl_hint()}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="assign-source-ref">
              {m.task_assign_source_ref_label()}
            </Label>
            <Input
              id="assign-source-ref"
              value={sourceRef}
              onChange={(e) => setSourceRef(e.target.value)}
              placeholder={m.task_assign_source_ref_placeholder()}
            />
            <p className="text-xs text-muted-foreground">
              {m.task_assign_source_ref_hint()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="allow-reassign"
            checked={allowReassign}
            onCheckedChange={setAllowReassign}
          />
          <Label htmlFor="allow-reassign" className="text-sm">
            {m.task_assign_allow_reassign()}
          </Label>
        </div>

        <Button
          onClick={handleAssign}
          disabled={parsedIds.length === 0 || assignMutation.isPending}
        >
          {assignMutation.isPending
            ? m.common_saving()
            : m.task_assign_submit({ count: parsedIds.length })}
        </Button>
      </section>

      <section className="space-y-3 rounded-xl border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-base font-semibold">{m.task_assign_list()}</h2>
            <p className="text-xs text-muted-foreground">
              {m.task_assign_list_count({ count: assignments?.length ?? 0 })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="active-only"
              checked={activeOnly}
              onCheckedChange={setActiveOnly}
            />
            <Label htmlFor="active-only" className="text-sm">
              {m.task_assign_active_only()}
            </Label>
          </div>
        </div>

        {isPending ? (
          <div className="flex h-32 items-center justify-center text-muted-foreground">
            {m.common_loading()}
          </div>
        ) : error ? (
          <div className="flex h-32 items-center justify-center text-destructive">
            {error.message}
          </div>
        ) : (assignments?.length ?? 0) === 0 ? (
          <div className="flex h-32 items-center justify-center text-muted-foreground">
            {m.task_assign_empty()}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.task_assign_col_user()}</TableHead>
                <TableHead>{m.task_assign_col_source()}</TableHead>
                <TableHead>{m.task_assign_col_assigned_at()}</TableHead>
                <TableHead>{m.task_assign_col_expires()}</TableHead>
                <TableHead>{m.task_assign_col_status()}</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments!.map((a) => {
                const expired =
                  a.expiresAt != null &&
                  new Date(a.expiresAt).getTime() <= Date.now()
                const revoked = a.revokedAt != null
                const active = !expired && !revoked
                return (
                  <TableRow key={a.endUserId}>
                    <TableCell className="font-mono text-xs">
                      {a.endUserId}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Badge variant="outline">{a.source}</Badge>
                        {a.sourceRef && (
                          <div className="font-mono text-xs text-muted-foreground">
                            {a.sourceRef}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(a.assignedAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {a.expiresAt
                        ? new Date(a.expiresAt).toLocaleString()
                        : m.task_assign_no_expiry()}
                    </TableCell>
                    <TableCell>
                      {revoked ? (
                        <Badge variant="destructive">
                          {m.task_assign_status_revoked()}
                        </Badge>
                      ) : expired ? (
                        <Badge variant="secondary">
                          {m.task_assign_status_expired()}
                        </Badge>
                      ) : (
                        <Badge>{m.task_assign_status_active()}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {active && (
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={revokeMutation.isPending}
                          onClick={() => handleRevoke(a.endUserId)}
                          aria-label={m.task_assign_revoke()}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  )
}
