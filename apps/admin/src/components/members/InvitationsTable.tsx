import { MailQuestionIcon, MoreHorizontalIcon } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { authClient } from "#/lib/auth-client"
import { cn } from "#/lib/utils"
import {
  useCancelInvitation,
  useOrgInvitations,
} from "#/hooks/use-members"

interface Props {
  scope: "org" | "project"
}

const STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  accepted: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  rejected: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  expired: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  canceled: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300",
}

const STATUS_LABEL: Record<string, string> = {
  pending: "待接受",
  accepted: "已接受",
  rejected: "已拒绝",
  expired: "已过期",
  canceled: "已撤销",
}

/**
 * 邀请列表 — 当前只接 org-level Better Auth invitation。
 * 项目级邀请(scope="project")依赖自家 server endpoint,PR 4 接入。
 */
export function InvitationsTable({ scope }: Props) {
  const { data: session } = authClient.useSession()
  const orgId = session?.session.activeOrganizationId ?? null
  const orgInvitations = useOrgInvitations(scope === "org" ? orgId : null)
  const cancel = useCancelInvitation()

  if (scope === "project") {
    return (
      <div className="rounded-md border p-12 text-center">
        <MailQuestionIcon className="mx-auto size-8 text-muted-foreground/60" />
        <p className="mt-2 text-sm text-muted-foreground">
          项目级邀请后端正在接入中。当前可在 组织 → 邀请 中向项目邀请成员。
        </p>
      </div>
    )
  }

  const rows = orgInvitations.data ?? []
  const isLoading = orgInvitations.isLoading

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>邮箱</TableHead>
            <TableHead className="w-32">角色</TableHead>
            <TableHead className="w-32">状态</TableHead>
            <TableHead className="w-32">过期时间</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 2 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell>
                  <Skeleton className="h-4 w-48" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-5 w-16" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-5 w-16" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-20" />
                </TableCell>
                <TableCell></TableCell>
              </TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-12 text-center text-sm text-muted-foreground">
                没有邀请记录
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => {
              const expires = row.expiresAt
                ? new Date(row.expiresAt).toLocaleDateString()
                : "—"
              const isPending = row.status === "pending"
              return (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.email}</TableCell>
                  <TableCell className="capitalize">{row.role ?? "—"}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(
                        "border-transparent",
                        STATUS_TONE[row.status] ?? "bg-muted",
                      )}
                    >
                      {STATUS_LABEL[row.status] ?? row.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{expires}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={!isPending}
                            aria-label="更多操作"
                          >
                            <MoreHorizontalIcon className="size-4" />
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          variant="destructive"
                          disabled={cancel.isPending}
                          onClick={() =>
                            cancel.mutate(
                              { invitationId: row.id },
                              {
                                onSuccess: () => toast.success("已撤销邀请"),
                                onError: (err) => toast.error(err.message),
                              },
                            )
                          }
                        >
                          撤销邀请
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>
    </div>
  )
}
