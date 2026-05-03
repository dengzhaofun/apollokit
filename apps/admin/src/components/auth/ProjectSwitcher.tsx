import { ChevronsUpDown, FolderKanban, Plus } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { Button } from "#/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu"
import { authClient } from "#/lib/auth-client"

/**
 * Project (= Better Auth team) switcher for the sidebar.
 *
 * Sits next to the company-level OrganizationSwitcher so users see two
 * concentric scopes:
 *
 *   [🏢 Acme Inc.] ← OrganizationSwitcher  (company / billing parent)
 *   [📁 My Game]   ← ProjectSwitcher       (the active project / tenantId)
 *
 * Dropdown lists every project the current user is a member of inside
 * the active organization. Clicking one calls `authClient.organization
 * .setActiveTeam({ teamId })` then reloads the page so every business
 * module re-fetches under the new tenant scope.
 *
 * The "Create new project" footer entry routes to `/onboarding/create-project`
 * which already supports the dual-tenant flow (create org → create team).
 */

type ProjectRow = {
  id: string
  name: string
  organizationId: string
}

interface ProjectSwitcherProps {
  size?: "icon" | undefined
}

export function ProjectSwitcher({ size }: ProjectSwitcherProps) {
  const { data: session } = authClient.useSession()
  const activeOrgId = session?.session.activeOrganizationId ?? null
  const activeTeamId = session?.session.activeTeamId ?? null

  const [projects, setProjects] = useState<ProjectRow[] | null>(null)
  const [loading, setLoading] = useState(false)

  // Reload the project list any time the active org changes (e.g. user
  // switched company in the OrganizationSwitcher next to us).
  useEffect(() => {
    if (!activeOrgId) {
      setProjects(null)
      return
    }
    let cancelled = false
    setLoading(true)
    authClient.organization
      .listTeams({ query: { organizationId: activeOrgId } })
      .then((res) => {
        if (cancelled) return
        const rows = (res?.data ?? []) as ProjectRow[]
        setProjects(rows)
      })
      .catch(() => {
        if (cancelled) return
        setProjects([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeOrgId])

  const activeProject = useMemo(
    () => projects?.find((p) => p.id === activeTeamId) ?? null,
    [projects, activeTeamId],
  )

  async function switchTo(teamId: string) {
    if (teamId === activeTeamId) return
    await authClient.organization.setActiveTeam({ teamId })
    // Reload so every module's data fetches under the new tenantId.
    window.location.reload()
  }

  if (!activeOrgId) return null

  // Icon-only: render a compact 8x8 button with the first letter of the
  // active project. Matches OrganizationSwitcher's size="icon" footprint.
  if (size === "icon") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="size-8 rounded-md"
              aria-label="Switch project"
            >
              <span className="text-xs font-medium">
                {(activeProject?.name ?? "?").slice(0, 1).toUpperCase()}
              </span>
            </Button>
          }
        />
        <ProjectMenu
          projects={projects}
          loading={loading}
          activeTeamId={activeTeamId}
          onSelect={switchTo}
        />
      </DropdownMenu>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            className="w-full justify-between gap-2"
          >
            <div className="flex min-w-0 items-center gap-2">
              <FolderKanban className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate text-left text-sm font-medium">
                {activeProject?.name ??
                  (loading ? "Loading…" : "Select project")}
              </span>
            </div>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
          </Button>
        }
      />
      <ProjectMenu
        projects={projects}
        loading={loading}
        activeTeamId={activeTeamId}
        onSelect={switchTo}
      />
    </DropdownMenu>
  )
}

function ProjectMenu(props: {
  projects: ProjectRow[] | null
  loading: boolean
  activeTeamId: string | null
  onSelect: (teamId: string) => void
}) {
  const { projects, loading, activeTeamId, onSelect } = props

  return (
    <DropdownMenuContent align="start" className="min-w-56">
      <DropdownMenuLabel className="text-xs uppercase text-muted-foreground">
        Projects
      </DropdownMenuLabel>
      {loading && !projects ? (
        <DropdownMenuItem disabled>Loading…</DropdownMenuItem>
      ) : !projects || projects.length === 0 ? (
        <DropdownMenuItem disabled>No projects</DropdownMenuItem>
      ) : (
        projects.map((p) => (
          <DropdownMenuItem
            key={p.id}
            onSelect={(e) => {
              e.preventDefault()
              onSelect(p.id)
            }}
            className="flex items-center gap-2"
          >
            <FolderKanban className="size-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate">{p.name}</span>
            {p.id === activeTeamId ? (
              <span className="text-xs text-muted-foreground">active</span>
            ) : null}
          </DropdownMenuItem>
        ))
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onSelect={() => {
          window.location.assign("/onboarding/create-project")
        }}
      >
        <Plus className="mr-2 size-4" />
        New project
      </DropdownMenuItem>
    </DropdownMenuContent>
  )
}
