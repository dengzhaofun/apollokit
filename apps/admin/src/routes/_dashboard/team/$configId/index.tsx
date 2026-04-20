import { useState } from "react"
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router"
import { format } from "date-fns"
import { Pencil, ArrowLeft, Trash2 } from "lucide-react"
import { toast } from "sonner"

import * as m from "#/paraglide/messages.js"
import { Button } from "#/components/ui/button"
import { Badge } from "#/components/ui/badge"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { Checkbox } from "#/components/ui/checkbox"
import {
  useTeamConfig,
  useUpdateTeamConfig,
  useDeleteTeamConfig,
  useTeams,
} from "#/hooks/use-team"
import { ApiError } from "#/lib/api-client"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"

export const Route = createFileRoute("/_dashboard/team/$configId/")({
  component: TeamDetailPage,
})

function TeamDetailPage() {
  const { configId } = Route.useParams()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)

  const { data: config, isPending, error } = useTeamConfig(configId)
  const { data: allTeams } = useTeams()
  const updateMutation = useUpdateTeamConfig()
  const deleteMutation = useDeleteTeamConfig()

  // Edit form state
  const [editName, setEditName] = useState("")
  const [editAlias, setEditAlias] = useState("")
  const [editMaxMembers, setEditMaxMembers] = useState(4)
  const [editAutoDissolve, setEditAutoDissolve] = useState(false)
  const [editQuickMatch, setEditQuickMatch] = useState(false)

  function startEditing() {
    if (!config) return
    setEditName(config.name)
    setEditAlias(config.alias ?? "")
    setEditMaxMembers(config.maxMembers)
    setEditAutoDissolve(config.autoDissolveOnLeaderLeave)
    setEditQuickMatch(config.allowQuickMatch)
    setEditing(true)
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault()
    if (!config) return
    try {
      await updateMutation.mutateAsync({
        id: config.id,
        input: {
          name: editName,
          alias: editAlias || null,
          maxMembers: editMaxMembers,
          autoDissolveOnLeaderLeave: editAutoDissolve,
          allowQuickMatch: editQuickMatch,
        },
      })
      toast.success(m.team_config_updated())
      setEditing(false)
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.body.error)
      } else {
        toast.error("Failed to update config")
      }
    }
  }

  async function handleDelete() {
    if (!config) return
    try {
      await deleteMutation.mutateAsync(config.id)
      toast.success(m.team_config_deleted())
      navigate({ to: "/team" })
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.body.error)
      } else {
        toast.error("Failed to delete config")
      }
    }
  }

  const configTeams = allTeams?.filter((t) => t.configId === configId) ?? []

  if (isPending) {
    return (
      <>
        <main className="flex h-40 items-center justify-center text-muted-foreground">
          {m.common_loading()}
        </main>
      </>
    )
  }

  if (error || !config) {
    return (
      <>
        <main className="flex h-40 items-center justify-center text-destructive">
          {error?.message ?? "Config not found"}
        </main>
      </>
    )
  }

  return (
    <>
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/team">
                <ArrowLeft className="size-4" />
                {m.common_back()}
              </Link>
            </Button>
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => (editing ? setEditing(false) : startEditing())}
              >
                <Pencil className="size-4" />
                {editing ? m.common_cancel() : m.common_edit()}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="size-4" />
                {deleteMutation.isPending
                  ? m.common_deleting()
                  : m.common_delete()}
              </Button>
            </div>
          </div>

          {editing ? (
            <div className="rounded-xl border bg-card p-6 shadow-sm">
              <form onSubmit={handleUpdate} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="editName">{m.common_name()}</Label>
                  <Input
                    id="editName"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="editAlias">{m.common_alias()}</Label>
                  <Input
                    id="editAlias"
                    value={editAlias}
                    onChange={(e) => setEditAlias(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="editMaxMembers">
                    {m.team_max_members()}
                  </Label>
                  <Input
                    id="editMaxMembers"
                    type="number"
                    min={1}
                    value={editMaxMembers}
                    onChange={(e) => setEditMaxMembers(Number(e.target.value))}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="editAutoDissolve"
                    checked={editAutoDissolve}
                    onCheckedChange={(v) => setEditAutoDissolve(v === true)}
                  />
                  <Label htmlFor="editAutoDissolve">
                    {m.team_auto_dissolve()}
                  </Label>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="editQuickMatch"
                    checked={editQuickMatch}
                    onCheckedChange={(v) => setEditQuickMatch(v === true)}
                  />
                  <Label htmlFor="editQuickMatch">
                    {m.team_quick_match()}
                  </Label>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditing(false)}
                  >
                    {m.common_cancel()}
                  </Button>
                  <Button type="submit" disabled={updateMutation.isPending}>
                    {updateMutation.isPending
                      ? m.common_saving()
                      : m.common_save_changes()}
                  </Button>
                </div>
              </form>
            </div>
          ) : (
            <div className="rounded-xl border bg-card p-6 shadow-sm">
              <div className="grid gap-4 sm:grid-cols-2">
                <DetailItem label={m.common_name()} value={config.name} />
                <DetailItem
                  label={m.common_alias()}
                  value={
                    config.alias ? (
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        {config.alias}
                      </code>
                    ) : (
                      m.common_dash()
                    )
                  }
                />
                <DetailItem
                  label={m.team_max_members()}
                  value={config.maxMembers}
                />
                <DetailItem
                  label={m.team_auto_dissolve()}
                  value={
                    <Badge
                      variant={
                        config.autoDissolveOnLeaderLeave
                          ? "default"
                          : "secondary"
                      }
                    >
                      {config.autoDissolveOnLeaderLeave ? "Yes" : "No"}
                    </Badge>
                  }
                />
                <DetailItem
                  label={m.team_quick_match()}
                  value={
                    <Badge
                      variant={
                        config.allowQuickMatch ? "default" : "secondary"
                      }
                    >
                      {config.allowQuickMatch ? "Yes" : "No"}
                    </Badge>
                  }
                />
                <DetailItem
                  label={m.common_created()}
                  value={format(new Date(config.createdAt), "yyyy-MM-dd HH:mm")}
                />
                <DetailItem
                  label={m.common_updated()}
                  value={format(new Date(config.updatedAt), "yyyy-MM-dd HH:mm")}
                />
              </div>
            </div>
          )}

          {/* Active teams for this config */}
          {!editing && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Active Teams</h3>
              <div className="rounded-xl border bg-card shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Leader</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Members</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {configTeams.length > 0 ? (
                      configTeams.map((team) => (
                        <TableRow key={team.id}>
                          <TableCell>
                            <Badge variant="secondary">
                              {team.leaderUserId}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                team.status === "active"
                                  ? "default"
                                  : "secondary"
                              }
                            >
                              {team.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{team.memberCount}</TableCell>
                          <TableCell>
                            {format(
                              new Date(team.createdAt),
                              "yyyy-MM-dd HH:mm",
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="h-24 text-center text-muted-foreground"
                        >
                          No active teams for this config.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  )
}

function DetailItem({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="text-sm">{value}</div>
    </div>
  )
}
