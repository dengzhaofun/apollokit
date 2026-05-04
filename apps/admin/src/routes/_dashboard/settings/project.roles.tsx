import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Trash2 } from "lucide-react"
import { useState } from "react"
import * as m from "#/paraglide/messages.js"

import { RouteGuard } from "#/components/auth/RouteGuard"
import { Button } from "#/components/ui/button"
import { Checkbox } from "#/components/ui/checkbox"
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
import { useCapabilities } from "#/lib/capabilities"
import { seo } from "#/lib/seo"

/**
 * Roles management — list built-in roles + custom roles (Better Auth
 * `dynamicAccessControl` enabled in server `auth.ts`).
 *
 * Built-in roles are read-only and come from the static ac.ts registry:
 *   org-level (member.role):    orgOwner / orgAdmin / orgViewer
 *   team-level (teamMember.role): owner / admin / operator / viewer / member
 *
 * Custom roles are created at runtime via `authClient.organization.
 * createRole({ role, permission })` and stored in the `organizationRole`
 * table. They live at the **organization** level (one role definition
 * shared across all projects in the organization), but are typically used
 * for team-level (project-scoped) permission grants — write the role
 * with team-level resource keys (activity, shop, ...).
 *
 * Permission matrix uses the SAME 40+ business resources / canonical
 * actions as the static ac registry (see server `auth/ac.ts`). The user
 * sees what they can grant from the capabilities they themselves hold.
 */
export const Route = createFileRoute("/_dashboard/settings/project/roles")({
  head: () => seo({ title: "Roles", noindex: true }),
  component: RolesPage,
})

const BUILTIN_ORG_ROLES = ["orgOwner", "orgAdmin", "orgViewer"] as const
const BUILTIN_TEAM_ROLES = [
  "owner",
  "admin",
  "operator",
  "viewer",
  "member",
] as const
const BUILTIN_ROLE_NAMES = new Set<string>([
  ...BUILTIN_ORG_ROLES,
  ...BUILTIN_TEAM_ROLES,
])

type DynamicRole = {
  id: string
  role: string
  permission: Record<string, string[]>
}

type ListRolesResponse =
  | { roles?: DynamicRole[] }
  | DynamicRole[]
  | null
  | undefined

const ROLES_KEY = ["org-roles"] as const

function useDynamicRoles() {
  const { data: session } = authClient.useSession()
  const orgId = session?.session.activeOrganizationId ?? null
  return useQuery({
    queryKey: [...ROLES_KEY, orgId] as const,
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data, error } = await (
        authClient.organization as unknown as {
          listRoles: (args: {
            query: { organizationId: string }
          }) => Promise<{ data?: ListRolesResponse; error?: unknown }>
        }
      ).listRoles({ query: { organizationId: orgId! } })
      if (error) throw error
      const roles = Array.isArray(data) ? data : (data?.roles ?? [])
      return roles.filter((r) => !BUILTIN_ROLE_NAMES.has(r.role))
    },
  })
}

function useCreateRole() {
  const qc = useQueryClient()
  const { data: session } = authClient.useSession()
  const orgId = session?.session.activeOrganizationId ?? null
  return useMutation({
    mutationFn: async (input: {
      role: string
      permission: Record<string, string[]>
    }) => {
      if (!orgId) throw new Error("no active organization")
      const { data, error } = await (
        authClient.organization as unknown as {
          createRole: (args: {
            role: string
            permission: Record<string, string[]>
            organizationId: string
          }) => Promise<{ data?: unknown; error?: unknown }>
        }
      ).createRole({
        role: input.role,
        permission: input.permission,
        organizationId: orgId,
      })
      if (error) throw error
      return data
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: [...ROLES_KEY, orgId] as const }),
  })
}

function useDeleteRole() {
  const qc = useQueryClient()
  const { data: session } = authClient.useSession()
  const orgId = session?.session.activeOrganizationId ?? null
  return useMutation({
    mutationFn: async (roleName: string) => {
      if (!orgId) throw new Error("no active organization")
      const { error } = await (
        authClient.organization as unknown as {
          deleteRole: (args: {
            roleName: string
            organizationId: string
          }) => Promise<{ error?: unknown }>
        }
      ).deleteRole({ roleName, organizationId: orgId })
      if (error) throw error
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: [...ROLES_KEY, orgId] as const }),
  })
}

function RolesPage() {
  // Roles management is org-level (creates/deletes affect every project).
  // Gate behind organization:update so only orgOwner / orgAdmin can use.
  return (
    <RouteGuard
      resource="organization"
      action="update"
      visibility="unauthorized-page"
    >
      <div className="mx-auto w-full max-w-4xl space-y-8">
        <BuiltinRolesSection />
        <DynamicRolesSection />
      </div>
    </RouteGuard>
  )
}

function BuiltinRolesSection() {
  return (
    <section>
      <h2 className="text-lg font-semibold tracking-tight">Built-in roles</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        These come from the platform RBAC matrix and cannot be edited.
        Org-level roles control billing, members, and project lifecycle;
        team-level roles control business module access inside one project.
      </p>
      <div className="mt-4 space-y-2">
        <RoleRowGroup
          label="Org level (organization)"
          names={[...BUILTIN_ORG_ROLES]}
        />
        <RoleRowGroup
          label="Team level (project)"
          names={[...BUILTIN_TEAM_ROLES]}
        />
      </div>
    </section>
  )
}

function RoleRowGroup({ label, names }: { label: string; names: string[] }) {
  return (
    <div>
      <div className="px-3 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
        {label}
      </div>
      <ul className="rounded-md border">
        {names.map((name, i) => (
          <li
            key={name}
            className={`flex items-center justify-between px-4 py-2.5 text-sm ${
              i > 0 ? "border-t" : ""
            }`}
          >
            <span className="font-medium">{name}</span>
            <span className="text-xs text-muted-foreground">built-in</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function DynamicRolesSection() {
  const list = useDynamicRoles()
  const del = useDeleteRole()
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <section>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Custom roles
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Define roles tailored to your team — e.g. a &ldquo;Community
            Moderator&rdquo; who can manage mail and announcements but not
            shops or items.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger
            render={<Button size="sm">+ New role</Button>}
          />
          <CreateRoleDialog onClose={() => setCreateOpen(false)} />
        </Dialog>
      </div>

      <div className="mt-4">
        {list.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !list.data || list.data.length === 0 ? (
          <p className="rounded-md border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
            No custom roles yet. Click &ldquo;New role&rdquo; to create one.
          </p>
        ) : (
          <ul className="rounded-md border">
            {list.data.map((r, i) => (
              <li
                key={r.id ?? r.role}
                className={`flex items-center justify-between gap-4 px-4 py-2.5 text-sm ${
                  i > 0 ? "border-t" : ""
                }`}
              >
                <div className="min-w-0">
                  <div className="font-medium">{r.role}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {summarizePermissions(r.permission)}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  disabled={del.isPending}
                  onClick={() => {
                    if (
                      confirm(
                        `Delete role "${r.role}"? Members assigned this role lose its permissions immediately.`,
                      )
                    ) {
                      del.mutate(r.role)
                    }
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function summarizePermissions(perm: Record<string, string[]>): string {
  const entries = Object.entries(perm).filter(([, a]) => a.length > 0)
  if (entries.length === 0) return "no permissions"
  const top = entries
    .slice(0, 4)
    .map(([res, actions]) => `${res}: ${actions.join("/")}`)
    .join(" · ")
  return entries.length > 4 ? `${top} · +${entries.length - 4} more` : top
}

function CreateRoleDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateRole()
  const { data: session } = authClient.useSession()
  // Drive the matrix off the active project's capability bag — admins
  // can only grant permissions they themselves hold. Better Auth's
  // server-side `create-role` endpoint enforces the same rule, so this
  // is just a UX guard.
  const tenantId = session?.session.activeTeamId ?? null
  const { data: caps } = useCapabilities(tenantId)

  const [name, setName] = useState("")
  const [matrix, setMatrix] = useState<Record<string, Set<string>>>({})

  // useCapabilities returns the full bag `{ role, capabilities }`. The
  // matrix only edits team-level (project-scoped) business resources —
  // org-level keys (organization / billing / orgMember / team / member /
  // invitation) belong to RBAC for organization actions and are out of scope
  // for a team-member-assigned custom role. Filter them out so the
  // dialog doesn't render a row whose actions value is a string (role)
  // or where the resource doesn't apply to the per-project context.
  const ORG_LEVEL_KEYS = new Set([
    "organization",
    "invitation",
    "team",
    "member",
    "billing",
    "orgMember",
  ])
  const capsMap: Record<string, string[]> =
    caps?.capabilities ?? ({} as Record<string, string[]>)
  const resources = Object.keys(capsMap)
    .filter((k) => !ORG_LEVEL_KEYS.has(k))
    .sort()

  function toggle(resource: string, action: string) {
    setMatrix((prev) => {
      const next = { ...prev }
      const set = new Set(next[resource] ?? [])
      if (set.has(action)) set.delete(action)
      else set.add(action)
      next[resource] = set
      return next
    })
  }

  async function handleSave() {
    if (!name.trim()) return
    if (BUILTIN_ROLE_NAMES.has(name.trim())) {
      alert("That name conflicts with a built-in role.")
      return
    }
    const permission: Record<string, string[]> = {}
    for (const [r, set] of Object.entries(matrix)) {
      const arr = Array.from(set)
      if (arr.length > 0) permission[r] = arr
    }
    if (Object.keys(permission).length === 0) {
      alert("Pick at least one permission.")
      return
    }
    await create.mutateAsync({ role: name.trim(), permission })
    setName("")
    setMatrix({})
    onClose()
  }

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Create custom role</DialogTitle>
        <DialogDescription>
          Roles are defined at the organization level and can be assigned to
          team members in any project. You can only grant permissions
          your own role currently holds.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3 py-2">
        <div>
          <Label htmlFor="role-name">Role name</Label>
          <Input
            id="role-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={m.project_role_key_placeholder()}
            className="mt-1"
          />
        </div>

        <div>
          <div className="mb-1 text-sm font-medium">Permissions</div>
          {!caps ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : resources.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No permissions to grant — your role can&rsquo;t grant anything.
            </p>
          ) : (
            <div className="max-h-80 overflow-y-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/50">
                  <tr>
                    <th className="px-3 py-1.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Resource
                    </th>
                    <th className="px-3 py-1.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {resources.map((res) => {
                    const actions: string[] = capsMap[res] ?? []
                    const selected = matrix[res] ?? new Set<string>()
                    return (
                      <tr key={res} className="border-t">
                        <td className="px-3 py-1.5 align-top font-mono text-xs">
                          {res}
                        </td>
                        <td className="px-3 py-1.5">
                          <div className="flex flex-wrap gap-x-4 gap-y-1">
                            {actions.map((act) => (
                              <label
                                key={act}
                                className="flex items-center gap-1.5 text-xs"
                              >
                                <Checkbox
                                  checked={selected.has(act)}
                                  onCheckedChange={() => toggle(res, act)}
                                />
                                {act}
                              </label>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={create.isPending || !name.trim()}
        >
          {create.isPending ? "Creating…" : "Create role"}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
