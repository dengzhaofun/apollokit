import { useTenantParams } from "#/hooks/use-tenant-params";
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { authClient } from "#/lib/auth-client"
import { seo } from "#/lib/seo"
import { Button } from "#/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"

/**
 * First-run project onboarding (Sentry-style).
 *
 * Sign-up auto-provisions an organization + a "Default project" team server-side
 * (see `databaseHooks.user.create.after` in `apps/server/src/auth.ts`),
 * so by the time we get here the user already has org + team rows. The
 * UI's only job is to let them rename "Default project" to something
 * meaningful before landing on the dashboard.
 *
 * `_dashboard.tsx` redirects here when `session.session.activeTeamId`
 * is null — which can still happen for old/test users created before
 * the auto-provisioning hook landed. For those we silently bootstrap
 * (find first org → setActive → bounce to dashboard) without showing a
 * form, since there's nothing meaningful to ask.
 *
 * The page lives OUTSIDE `_dashboard` on purpose: the dashboard layout
 * mounts sidebar + command palette + project-scoped data hooks, all of
 * which assume `activeTeamId` is present.
 */
export const Route = createFileRoute("/onboarding/create-project")({
  head: () => seo({ title: "Create project", noindex: true }),
  component: CreateProjectPage,
})

function CreateProjectPage() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    )
  }
  return <CreateProjectClient />
}

function CreateProjectClient() {
    const { orgSlug, projectSlug } = useTenantParams()
  const { data: session, isPending } = authClient.useSession()
  const navigate = useNavigate()
  const [name, setName] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [bootstrapping, setBootstrapping] = useState(true)
  const [defaultTeamId, setDefaultTeamId] = useState<string | null>(null)
  // StrictMode double-invoke guard for the auto-setActive path.
  const autoRan = useRef(false)

  useEffect(() => {
    if (isPending) return
    if (!session) {
      navigate({ to: "/auth/$authView", params: { authView: "sign-in" } })
      return
    }
    if (session.session.activeTeamId) {
      navigate({ to: "/o/$orgSlug/p/$projectSlug/dashboard", replace: true , params: { orgSlug, projectSlug }})
      return
    }
    if (autoRan.current) return
    autoRan.current = true
    ;(async () => {
      const { data: orgs } = await authClient.organization.list()
      if (!orgs || orgs.length === 0) {
        // Edge case: user signed up but auto-provisioning didn't run.
        // Bounce to sign-out so they retry — shouldn't happen in practice.
        toast.error("No organization found. Please sign in again.")
        navigate({ to: "/auth/$authView", params: { authView: "sign-in" } })
        return
      }
      // Set the auto-created org as active and prep the rename form
      // against the auto-created "Default project".
      const orgId = orgs[0].id
      await authClient.organization.setActive({ organizationId: orgId })
      await authClient.getSession({ query: { disableCookieCache: true } })

      type ListTeamsArg = { query: { organizationId: string } }
      const teamsRes = await (
        authClient.organization as unknown as {
          listTeams: (args: ListTeamsArg) => Promise<{
            data?: Array<{ id: string; name: string }> | null
          }>
        }
      ).listTeams({ query: { organizationId: orgId } })
      const teams = teamsRes?.data ?? []
      if (teams.length === 0) {
        // Even more edge: org exists but no team. Skip onboarding form
        // and let the user create one from Settings later.
        navigate({ to: "/o/$orgSlug/p/$projectSlug/dashboard", replace: true , params: { orgSlug, projectSlug }})
        return
      }
      const firstTeam = teams[0]
      setDefaultTeamId(firstTeam.id)
      setName(firstTeam.name === "Default project" ? "" : firstTeam.name)
      setBootstrapping(false)
    })().catch(() => {
      setBootstrapping(false)
    })
  }, [isPending, session, navigate, orgSlug, projectSlug])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || submitting || !defaultTeamId) return
    setSubmitting(true)
    try {
      type UpdateTeamArgs = { teamId: string; data: { name: string } }
      const { error } = await (
        authClient.organization as unknown as {
          updateTeam: (
            args: UpdateTeamArgs,
          ) => Promise<{ data?: unknown; error?: { message?: string } | null }>
        }
      ).updateTeam({ teamId: defaultTeamId, data: { name: name.trim() } })
      if (error) {
        toast.error(error.message ?? "Failed to rename project")
        setSubmitting(false)
        return
      }
      await authClient.organization.setActiveTeam({ teamId: defaultTeamId })
      await authClient.getSession({ query: { disableCookieCache: true } })
      navigate({ to: "/o/$orgSlug/p/$projectSlug/dashboard", replace: true , params: { orgSlug, projectSlug }})
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to rename project")
      setSubmitting(false)
    }
  }

  async function handleSkip() {
    if (!defaultTeamId || submitting) return
    setSubmitting(true)
    try {
      await authClient.organization.setActiveTeam({ teamId: defaultTeamId })
      await authClient.getSession({ query: { disableCookieCache: true } })
      navigate({ to: "/o/$orgSlug/p/$projectSlug/dashboard", replace: true , params: { orgSlug, projectSlug }})
    } catch {
      setSubmitting(false)
    }
  }

  if (isPending || bootstrapping) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    )
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-4 py-14">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Name your first project</CardTitle>
          <CardDescription>
            We created a workspace for you. Give your first project a
            name — your game, app, or environment. You can add more
            projects, rename, or transfer them later from Settings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-6" onSubmit={handleSubmit}>
            <div className="grid gap-2">
              <Label htmlFor="project-name">Project name</Label>
              <Input
                id="project-name"
                autoFocus
                placeholder="My Game"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={1}
                maxLength={80}
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={submitting || !name.trim()}
                className="flex-1"
              >
                {submitting ? "Saving…" : "Continue"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={submitting}
                onClick={handleSkip}
              >
                Skip
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
