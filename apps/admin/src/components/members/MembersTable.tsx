import { useMemo, useState } from "react"
import { DownloadIcon, MoreHorizontalIcon, UsersIcon } from "lucide-react"
import { toast } from "sonner"
import * as m from "#/paraglide/messages.js"

import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import { StatusBadge, type StatusValue } from "#/components/ui/status-badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "#/components/ui/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu"
import { Skeleton } from "#/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import { FilterBar } from "#/components/patterns/FilterBar"
import { authClient } from "#/lib/auth-client"
import { cn } from "#/lib/utils"
import {
  useOrgMembers,
  useProjectMembers,
  useRemoveMember,
  useUpdateMemberRole,
  type OrgMemberRow,
  type ProjectMemberRow,
} from "#/hooks/use-members"

import { InviteMembersDialog } from "./InviteMembersDialog"

interface Props {
  scope: "org" | "project"
}

const ORG_ROLES = [
  { value: "orgOwner", label: "Owner" },
  { value: "orgAdmin", label: "Admin" },
  { value: "orgViewer", label: "Viewer" },
]

const PROJECT_ROLES = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "operator", label: "Operator" },
  { value: "viewer", label: "Viewer" },
  { value: "member", label: "Member" },
]

const ROLE_BADGE_TONE: Record<string, string> = {
  orgOwner: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  orgAdmin: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  orgViewer: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  owner: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  admin: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  operator: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  viewer: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  member: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300",
}

/** 从 role 推断一个占位 status（后端接入真实 presence 后替换） */
function inferStatus(role: string, createdAt: string | null): StatusValue {
  if (role === "orgOwner" || role === "owner") return "active"
  if (createdAt) {
    const daysSince = (Date.now() - new Date(createdAt).getTime()) / 86_400_000
    if (daysSince < 7) return "active"
    if (daysSince < 30) return "away"
  }
  return "offline"
}

function exportCsv(rows: (OrgMemberRow | ProjectMemberRow)[], filename: string) {
  const headers = ["Name", "Email", "Role", "Joined"]
  const lines = rows.map((r) => {
    const u = r.user
    const name = u?.name?.trim() || u?.email || ""
    const email = u?.email || ""
    const joined = r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ""
    return [name, email, r.role, joined].map((v) => `"${v}"`).join(",")
  })
  const csv = [headers.join(","), ...lines].join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function MembersTable({ scope }: Props) {
  const { data: session } = authClient.useSession()
  const orgId = session?.session.activeOrganizationId ?? null
  const teamId = session?.session.activeTeamId ?? null

  const orgMembers = useOrgMembers(scope === "org" ? orgId : null)
  const projectMembers = useProjectMembers(scope === "project" ? teamId : null)

  const isLoading = scope === "org" ? orgMembers.isLoading : projectMembers.isLoading
  const rows = useMemo<(OrgMemberRow | ProjectMemberRow)[]>(
    () =>
      scope === "org" ? orgMembers.data ?? [] : projectMembers.data ?? [],
    [scope, orgMembers.data, projectMembers.data],
  )

  const [query, setQuery] = useState("")
  const [roleFilter, setRoleFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")

  const ROLES = scope === "org" ? ORG_ROLES : PROJECT_ROLES

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      if (q) {
        const u = r.user
        const matches =
          (u?.name ?? "").toLowerCase().includes(q) ||
          (u?.email ?? "").toLowerCase().includes(q) ||
          r.role.toLowerCase().includes(q)
        if (!matches) return false
      }
      if (roleFilter !== "all" && r.role !== roleFilter) return false
      if (statusFilter !== "all") {
        const status = inferStatus(r.role, r.createdAt)
        if (status !== statusFilter) return false
      }
      return true
    })
  }, [rows, query, roleFilter, statusFilter])

  return (
    <div className="space-y-4">
      <FilterBar
        search={{ value: query, onChange: setQuery, placeholder: "搜索姓名、邮箱、角色…" }}
        filters={[
          {
            key: "role",
            label: "All Roles",
            value: roleFilter,
            onChange: setRoleFilter,
            options: ROLES.map((r) => ({ value: r.value, label: r.label })),
          },
          {
            key: "status",
            label: "All Status",
            value: statusFilter,
            onChange: setStatusFilter,
            options: [
              { value: "active", label: "Active" },
              { value: "away", label: "Away" },
              { value: "offline", label: "Offline" },
              { value: "pending", label: "Pending" },
            ],
          },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportCsv(filtered, `members-${scope}.csv`)}
            >
              <DownloadIcon className="size-3.5" />
              Export CSV
            </Button>
            <InviteMembersDialog scope={scope} />
          </div>
        }
      />

      <div className="rounded-xl border shadow-[0_1px_3px_oklch(0_0_0/0.04)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>成员</TableHead>
              <TableHead className="w-28">角色</TableHead>
              <TableHead className="w-32">状态</TableHead>
              <TableHead className="w-32">加入时间</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <>
                {Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Skeleton className="h-9 w-48" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-16" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-16" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                ))}
              </>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center">
                  <div className="mx-auto flex max-w-xs flex-col items-center gap-2 text-sm text-muted-foreground">
                    <UsersIcon className="size-8 opacity-50" />
                    <p>
                      {scope === "project" && !teamId
                        ? "请先选择一个项目"
                        : query
                          ? "没有匹配的成员"
                          : scope === "project"
                            ? "项目级成员管理后端正在接入中"
                            : "暂无成员"}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => (
                <MemberRow
                  key={row.id}
                  row={row}
                  scope={scope}
                  roles={ROLES}
                  organizationId={orgId}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function MemberRow({
  row,
  scope,
  roles,
  organizationId,
}: {
  row: OrgMemberRow | ProjectMemberRow
  scope: "org" | "project"
  roles: { value: string; label: string }[]
  organizationId: string | null
}) {
  const updateRole = useUpdateMemberRole()
  const remove = useRemoveMember()
  const [removeOpen, setRemoveOpen] = useState(false)

  const u = row.user
  const displayName = u?.name?.trim() || u?.email || "未知用户"
  const initials = (u?.name?.trim() || u?.email || "?")
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
  const created = row.createdAt
    ? new Date(row.createdAt).toLocaleDateString()
    : "—"
  const status = inferStatus(row.role, row.createdAt)

  const handleChangeRole = (next: string) => {
    if (next === row.role) return
    if (scope === "org" && organizationId) {
      updateRole.mutate(
        { organizationId, memberId: row.id, role: next },
        {
          onSuccess: () => toast.success(`已更新角色为 ${roleLabel(next, roles)}`),
          onError: (err) => toast.error(err.message),
        },
      )
    } else {
      toast.info("项目级角色变更后端接入中")
    }
  }

  const handleRemove = () => {
    if (scope === "org" && organizationId && u?.email) {
      remove.mutate(
        { organizationId, memberIdOrEmail: u.email },
        {
          onSuccess: () => {
            toast.success(`已移除 ${displayName}`)
            setRemoveOpen(false)
          },
          onError: (err) => toast.error(err.message),
        },
      )
    } else {
      toast.info("项目级移除后端接入中")
      setRemoveOpen(false)
    }
  }

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar size="sm">
            {u?.image ? <AvatarImage src={u.image} alt={displayName} /> : null}
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">{displayName}</span>
            {u?.email && u?.name?.trim() ? (
              <span className="truncate text-xs text-muted-foreground">
                {u.email}
              </span>
            ) : null}
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={cn(
            "border-transparent font-medium capitalize",
            ROLE_BADGE_TONE[row.role] ?? "bg-muted",
          )}
        >
          {roleLabel(row.role, roles)}
        </Badge>
      </TableCell>
      <TableCell>
        <StatusBadge status={status} />
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">{created}</TableCell>
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon-sm" aria-label={m.aria_more_actions()}>
                <MoreHorizontalIcon className="size-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>变更角色</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={row.role}
                  onValueChange={handleChangeRole}
                >
                  {roles.map((r) => (
                    <DropdownMenuRadioItem key={r.value} value={r.value}>
                      {r.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setRemoveOpen(true)}
            >
              移除成员
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>移除 {displayName}?</AlertDialogTitle>
              <AlertDialogDescription>
                {scope === "org"
                  ? `${displayName} 会失去对该组织所有项目的访问权，但 SSO/SCIM 同步可能会再加回来。`
                  : `${displayName} 会失去对该项目的访问权，但仍是组织成员。`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleRemove}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                移除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TableCell>
    </TableRow>
  )
}

function roleLabel(value: string, roles: { value: string; label: string }[]) {
  return roles.find((r) => r.value === value)?.label ?? value
}
