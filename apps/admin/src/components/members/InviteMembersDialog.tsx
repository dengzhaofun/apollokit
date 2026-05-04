import { useState } from "react"
import { MailPlusIcon, PlusIcon } from "lucide-react"
import { toast } from "sonner"
import * as m from "#/paraglide/messages.js"

import { Button } from "#/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog"
import { Label } from "#/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import { Textarea } from "#/components/ui/textarea"
import { authClient } from "#/lib/auth-client"
import { useInviteMember } from "#/hooks/use-members"

interface Props {
  scope: "org" | "project"
}

const ORG_ROLES = [
  { value: "orgOwner", label: "Owner" },
  { value: "orgAdmin", label: "Admin" },
  { value: "orgViewer", label: "Viewer" },
]

const PROJECT_ROLES = [
  { value: "admin", label: "Admin" },
  { value: "operator", label: "Operator" },
  { value: "viewer", label: "Viewer" },
]

export function InviteMembersDialog({ scope }: Props) {
  const { data: session } = authClient.useSession()
  const orgId = session?.session.activeOrganizationId ?? null
  const teamId = session?.session.activeTeamId ?? null

  const invite = useInviteMember()
  const [open, setOpen] = useState(false)
  const [emailsRaw, setEmailsRaw] = useState("")
  const [role, setRole] = useState(scope === "org" ? "orgAdmin" : "operator")

  const ROLES = scope === "org" ? ORG_ROLES : PROJECT_ROLES

  const submit = async () => {
    if (!orgId) {
      toast.error("没有活动组织")
      return
    }
    const emails = emailsRaw
      .split(/[\s,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (emails.length === 0) {
      toast.error("请输入至少一个邮箱")
      return
    }
    let succeeded = 0
    const failed: string[] = []
    for (const email of emails) {
      try {
        await invite.mutateAsync({
          organizationId: orgId,
          email,
          role,
          ...(scope === "project" && teamId ? { teamId } : {}),
        })
        succeeded++
      } catch (err) {
        failed.push(`${email}: ${(err as Error).message}`)
      }
    }
    if (succeeded > 0) {
      toast.success(`已发出 ${succeeded} 个邀请`)
    }
    if (failed.length > 0) {
      toast.error(`${failed.length} 个邀请失败`, {
        description: failed.slice(0, 3).join("\n"),
      })
    }
    setEmailsRaw("")
    if (failed.length === 0) setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button>
            <PlusIcon className="size-4" />
            邀请成员
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MailPlusIcon className="size-4" />
            {scope === "org" ? "邀请到组织" : "邀请到项目"}
          </DialogTitle>
          <DialogDescription>
            被邀请人会收到邮件;接受后{" "}
            {scope === "org" ? "成为组织成员" : "加入到当前项目"}。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invite-emails">邮箱(支持逗号 / 换行分隔多个)</Label>
            <Textarea
              id="invite-emails"
              value={emailsRaw}
              onChange={(e) => setEmailsRaw(e.target.value)}
              placeholder={m.members_invite_emails_placeholder()}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label>角色</Label>
            <Select
              value={role}
              onValueChange={(v) => v && setRole(v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button onClick={submit} disabled={invite.isPending}>
            {invite.isPending ? "发送中…" : "发送邀请"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
