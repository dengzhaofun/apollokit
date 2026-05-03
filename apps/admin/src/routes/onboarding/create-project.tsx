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
 * First-run project onboarding.
 *
 * `_dashboard.tsx` redirects here when `session.session.activeTeamId`
 * is null. Two sub-cases, handled by the same route:
 *
 *  - User has zero projects → render the "create your first project" form.
 *    On submit: `organization.create` → `organization.setActive` →
 *    refresh session cache (so `activeTeamId` propagates without
 *    requiring sign-out) → navigate to `/dashboard`.
 *  - User has ≥1 projects but session lost the active one (e.g. the old
 *    `session.create.before` hook was removed, or Better Auth session
 *    was rebuilt mid-flight) → silently `setActive(firstProject)` and
 *    bounce to `/dashboard`. No UI flash.
 *
 * The page lives OUTSIDE `_dashboard` on purpose: the dashboard layout
 * mounts sidebar + command palette + project-scoped data hooks, all of
 * which assume `activeTeamId` is present. Rendering any part
 * of that shell from an unscoped session is what produces the silent
 * 401 cascade this page exists to prevent.
 */
export const Route = createFileRoute("/onboarding/create-project")({
  head: () => seo({ title: "Create project", noindex: true }),
  component: CreateProjectPage,
})

/**
 * SSR gate — `better-auth/react`'s `useSession` dies under Vite SSR due
 * to a dual-React-package hazard (see `_dashboard.tsx` for the same
 * workaround). Render a skeleton on the server + first client tick,
 * then mount the session-aware component.
 */
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

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
  return base ? `${base}-${Date.now().toString(36)}` : `project-${Date.now().toString(36)}`
}

function CreateProjectClient() {
  const { data: session, isPending } = authClient.useSession()
  const navigate = useNavigate()
  const [name, setName] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [bootstrapping, setBootstrapping] = useState(true)
  // StrictMode double-invoke guard for the auto-setActive path.
  const autoRan = useRef(false)

  useEffect(() => {
    if (isPending) return
    if (!session) {
      navigate({ to: "/auth/$authView", params: { authView: "sign-in" } })
      return
    }
    if (session.session.activeTeamId) {
      navigate({ to: "/dashboard", replace: true })
      return
    }
    if (autoRan.current) return
    autoRan.current = true
    ;(async () => {
      const { data: orgs } = await authClient.organization.list()
      if (orgs && orgs.length > 0) {
        await authClient.organization.setActive({ organizationId: orgs[0].id })
        await authClient.getSession({ query: { disableCookieCache: true } })
        navigate({ to: "/dashboard", replace: true })
        return
      }
      setBootstrapping(false)
    })().catch(() => {
      setBootstrapping(false)
    })
  }, [isPending, session, navigate])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || submitting) return
    setSubmitting(true)
    try {
      const { data: created, error } = await authClient.organization.create({
        name: name.trim(),
        slug: slugify(name),
      })
      if (error || !created) {
        toast.error(error?.message ?? "Failed to create project")
        setSubmitting(false)
        return
      }
      await authClient.organization.setActive({ organizationId: created.id })
      await authClient.getSession({ query: { disableCookieCache: true } })
      navigate({ to: "/dashboard", replace: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create project")
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
          <CardTitle>Create your project</CardTitle>
          <CardDescription>
            ApolloKit is multi-tenant — every workspace is a project.
            Give yours a name to continue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-6" onSubmit={handleSubmit}>
            <div className="grid gap-2">
              <Label htmlFor="project-name">Project name</Label>
              <Input
                id="project-name"
                autoFocus
                autoComplete="organization"
                placeholder="Acme Games"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={1}
                maxLength={80}
              />
            </div>
            <Button type="submit" disabled={submitting || !name.trim()}>
              {submitting ? "Creating…" : "Create project"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
