import { useMemo, useState } from "react"
import { MoreHorizontalIcon, SearchIcon, UsersIcon } from "lucide-react"
import { toast } from "sonner"

import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar"
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
import { Input } from "#/components/ui/input"
import { Skeleton } from "#/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
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

/**
 * 复用的成员管理表格 —— scope="org" 渲染组织成员,scope="project"
 * 渲染当前 active project 的成员。两套 RBAC 角色集用 ROLE 常量切。
 *
 * 项目级成员管理依赖自家 server endpoint `/api/v1/team-members`,
 * 还没接入时表格显示空态 + "Coming soon" 文案;PR 4 接入后立刻可用。
 */
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
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const u = r.user
      return (
        (u?.name ?? "").toLowerCase().includes(q) ||
        (u?.email ?? "").toLowerCase().includes(q) ||
        r.role.toLowerCase().includes(q)
      )
    })
  }, [rows, query])

  const ROLES = scope === "org" ? ORG_ROLES : PROJECT_ROLES

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm">
          <SearchIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索姓名、邮箱、角色"
            className="pl-8"
          />
        </div>
        <InviteMembersDialog scope={scope} />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>成员</TableHead>
              <TableHead className="w-32">角色</TableHead>
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
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                ))}
              </>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-12 text-center">
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
      // 项目级角色变更走自家 endpoint(PR 4 接入)
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
      <TableCell className="text-muted-foreground">{created}</TableCell>
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon-sm" aria-label="更多操作">
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
                  ? `${displayName} 会失去对该组织所有项目的访问权,但 SSO/SCIM 同步可能会再加回来。`
                  : `${displayName} 会失去对该项目的访问权,但仍是组织成员。`}
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
