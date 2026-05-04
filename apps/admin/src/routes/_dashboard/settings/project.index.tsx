import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useState, useEffect } from "react"
import { toast } from "sonner"
import * as m from "#/paraglide/messages.js"

import { RouteGuard } from "#/components/auth/RouteGuard"
import { Button } from "#/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { authClient } from "#/lib/auth-client"
import { seo } from "#/lib/seo"

/**
 * Settings for the **active** project (Better Auth team) only —
 * rename + danger zone (delete this project).
 *
 * Cross-project listing (create / pick / list other projects) lives at
 * `/settings/organization` next to organization-level settings, since
 * lifecycle of projects is an org-level operation. Switching between
 * projects is done via the sidebar `ProjectSwitcher`.
 *
 * RouteGuard: `team:update` (org-level grant — orgAdmin / orgOwner).
 */
export const Route = createFileRoute("/_dashboard/settings/project/")({
  head: () => seo({ title: "Project settings", noindex: true }),
  component: ProjectSettingsPage,
})

type ListTeamsResponse = Array<{ id: string; name: string; organizationId: string }> | null | undefined

function useActiveTeam() {
  const { data: session } = authClient.useSession()
  const orgId = session?.session.activeOrganizationId ?? null
  const teamId = session?.session.activeTeamId ?? null
  return useQuery({
    queryKey: ["active-team", orgId, teamId] as const,
    enabled: Boolean(orgId && teamId),
    queryFn: async () => {
      const res = await (
        authClient.organization as unknown as {
          listTeams: (args: {
            query: { organizationId: string }
          }) => Promise<{ data?: ListTeamsResponse; error?: unknown }>
        }
      ).listTeams({ query: { organizationId: orgId! } })
      const teams = res?.data ?? []
      return teams.find((t) => t.id === teamId) ?? null
    },
  })
}

function ProjectSettingsPage() {
  return (
    <RouteGuard
      resource="team"
      action="update"
      visibility="unauthorized-page"
    >
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <ProjectNameCard />
        <DeleteProjectCard />
      </div>
    </RouteGuard>
  )
}

function ProjectNameCard() {
  const qc = useQueryClient()
  const team = useActiveTeam()
  const [name, setName] = useState("")
  const initial = team.data?.name ?? ""
  // Sync local state on first load + when switching projects.
  useEffect(() => {
    setName(initial)
  }, [initial])

  const update = useMutation({
    mutationFn: async (newName: string) => {
      if (!team.data?.id) throw new Error("no active project")
      type Args = { teamId: string; data: { name: string } }
      const { error } = await (
        authClient.organization as unknown as {
          updateTeam: (
            args: Args,
          ) => Promise<{ data?: unknown; error?: { message?: string } | null }>
        }
      ).updateTeam({ teamId: team.data.id, data: { name: newName } })
      if (error) throw new Error(error.message ?? "Failed to rename")
    },
    onSuccess: () => {
      toast.success("Project renamed")
      qc.invalidateQueries({ queryKey: ["active-team"] })
    },
    onError: (err) => toast.error(err.message),
  })

  const dirty = name.trim() !== initial && name.trim().length > 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Project name</CardTitle>
        <CardDescription>
          The display name for this project (your game / app /
          environment). Visible to teammates who have access.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2">
          <Label htmlFor="project-name">Name</Label>
          <Input
            id="project-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={m.project_name_placeholder()}
            maxLength={80}
            disabled={!team.data}
          />
        </div>
      </CardContent>
      <CardFooter className="border-t pt-4">
        <Button
          onClick={() => update.mutate(name.trim())}
          disabled={!dirty || update.isPending}
          className="ml-auto"
        >
          {update.isPending ? "Saving…" : "Save"}
        </Button>
      </CardFooter>
    </Card>
  )
}

function DeleteProjectCard() {
  const team = useActiveTeam()
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState("")
  const projectName = team.data?.name ?? ""

  const del = useMutation({
    mutationFn: async () => {
      if (!team.data?.id) throw new Error("no active project")
      type Args = { teamId: string }
      const { error } = await (
        authClient.organization as unknown as {
          removeTeam: (
            args: Args,
          ) => Promise<{ error?: { message?: string } | null }>
        }
      ).removeTeam({ teamId: team.data.id })
      if (error) throw new Error(error.message ?? "Failed to delete")
    },
    onSuccess: () => {
      toast.success("Project deleted")
      // Reload — server's session.update.before will pick a new active
      // team in the same org if any remain; otherwise dashboard guard
      // sends to onboarding.
      setOpen(false)
      window.location.assign("/dashboard")
    },
    onError: (err) => toast.error(err.message),
  })

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive">Delete project</CardTitle>
        <CardDescription>
          Permanently delete this project and every record scoped to it
          — activities, items, players, audit logs, API keys, webhooks.
          This cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardFooter className="border-t pt-4">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger
            render={
              <Button variant="destructive" className="ml-auto">
                Delete project
              </Button>
            }
          />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete &ldquo;{projectName}&rdquo;?</DialogTitle>
              <DialogDescription>
                Type the project name &ldquo;<b>{projectName}</b>&rdquo; to
                confirm. All scoped data will be wiped.
              </DialogDescription>
            </DialogHeader>
            <Input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={projectName}
              autoFocus
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={confirm !== projectName || del.isPending}
                onClick={() => del.mutate()}
              >
                {del.isPending ? "Deleting…" : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardFooter>
    </Card>
  )
}
