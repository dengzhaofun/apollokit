import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { format } from "date-fns"
import { ArrowLeft, Ban, Trash2 } from "lucide-react"
import { toast } from "sonner"

import * as m from "#/paraglide/messages.js"
import { SidebarTrigger } from "#/components/ui/sidebar"
import { Separator } from "#/components/ui/separator"
import { Button } from "#/components/ui/button"
import { Badge } from "#/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "#/components/ui/alert-dialog"
import {
  useDeleteMailMessage,
  useMailMessage,
  useRevokeMailMessage,
} from "#/hooks/use-mail"
import { ItemRewardRow } from "#/components/item/ItemRewardRow"
import { ApiError } from "#/lib/api-client"
import type { MailMessageWithStats } from "#/lib/types/mail"

export const Route = createFileRoute("/_dashboard/mail/$messageId/")({
  component: MailDetailPage,
})

function MailDetailPage() {
  const { messageId } = Route.useParams()
  const navigate = useNavigate()

  const { data, isPending, error } = useMailMessage(messageId)
  const revokeMutation = useRevokeMailMessage()
  const deleteMutation = useDeleteMailMessage()

  if (isPending) {
    return (
      <>
        <Header title={m.common_loading()} />
        <main className="flex h-40 items-center justify-center text-muted-foreground">
          {m.common_loading()}
        </main>
      </>
    )
  }

  if (error || !data) {
    return (
      <>
        <Header title="Error" />
        <main className="flex h-40 items-center justify-center text-destructive">
          {error?.message ?? m.mail_not_found()}
        </main>
      </>
    )
  }

  const detail: MailMessageWithStats = data
  const status = detail.revokedAt
    ? m.mail_status_revoked()
    : detail.expiresAt && new Date(detail.expiresAt).getTime() <= Date.now()
      ? m.mail_status_expired()
      : m.mail_status_active()

  const isUnicast =
    detail.targetType === "multicast" &&
    (detail.targetUserIds?.length ?? 0) === 1

  return (
    <>
      <Header title={detail.title} />

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/mail">
                <ArrowLeft className="size-4" />
                {m.common_back()}
              </Link>
            </Button>
            <div className="ml-auto flex items-center gap-2">
              {!detail.revokedAt && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={revokeMutation.isPending}
                    >
                      <Ban className="size-4" />
                      {m.mail_revoke()}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {m.mail_revoke_confirm_title()}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {m.mail_revoke_confirm_desc()}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>
                        {m.common_cancel()}
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={async () => {
                          try {
                            await revokeMutation.mutateAsync(detail.id)
                            toast.success(m.mail_revoked())
                          } catch (err) {
                            if (err instanceof ApiError) {
                              toast.error(err.body.error)
                            } else {
                              toast.error(m.mail_failed_revoke())
                            }
                          }
                        }}
                      >
                        {m.mail_revoke()}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="size-4" />
                    {m.common_delete()}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {m.mail_delete_confirm_title()}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {m.mail_delete_confirm_desc()}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={async () => {
                        try {
                          await deleteMutation.mutateAsync(detail.id)
                          toast.success(m.mail_deleted())
                          navigate({ to: "/mail" })
                        } catch (err) {
                          if (err instanceof ApiError) {
                            toast.error(err.body.error)
                          } else {
                            toast.error(m.mail_failed_delete())
                          }
                        }
                      }}
                    >
                      {m.common_delete()}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          {/* Payload */}
          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <div className="grid gap-4 sm:grid-cols-2">
              <DetailItem
                label={m.mail_field_target_type()}
                value={
                  <Badge variant="secondary">
                    {isUnicast
                      ? m.mail_target_unicast()
                      : detail.targetType === "broadcast"
                        ? m.mail_target_broadcast()
                        : m.mail_target_multicast()}
                  </Badge>
                }
              />
              <DetailItem
                label={m.common_status()}
                value={<Badge variant="outline">{status}</Badge>}
              />
              <DetailItem
                label={m.mail_col_sent_at()}
                value={format(new Date(detail.sentAt), "yyyy-MM-dd HH:mm")}
              />
              <DetailItem
                label={m.mail_field_expires_at()}
                value={
                  detail.expiresAt
                    ? format(new Date(detail.expiresAt), "yyyy-MM-dd HH:mm")
                    : "—"
                }
              />
              <DetailItem
                label={m.mail_col_require_read()}
                value={
                  detail.requireRead
                    ? m.mail_require_read_yes()
                    : m.common_inactive()
                }
              />
              {detail.originSource && (
                <DetailItem
                  label={m.mail_origin_source()}
                  value={
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                      {detail.originSource}/{detail.originSourceId}
                    </code>
                  }
                />
              )}
              <div className="sm:col-span-2">
                <DetailItem
                  label={m.mail_field_content()}
                  value={
                    <pre className="whitespace-pre-wrap rounded bg-muted/50 p-3 text-sm">
                      {detail.content}
                    </pre>
                  }
                />
              </div>
            </div>
          </div>

          {/* Rewards */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">{m.mail_field_rewards()}</h3>
            {detail.rewards.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {m.mail_no_rewards()}
              </p>
            ) : (
              <ul className="space-y-2 rounded-lg border bg-card p-4 text-sm">
                {detail.rewards.map((r, i) => (
                  <li key={i}>
                    <ItemRewardRow
                      definitionId={r.definitionId}
                      quantity={r.quantity}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Stats */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">{m.mail_stats()}</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard
                label={m.mail_stat_targets()}
                value={detail.targetCount ?? m.mail_all_users()}
              />
              <StatCard
                label={m.mail_stat_reads()}
                value={detail.readCount}
              />
              <StatCard
                label={m.mail_stat_claims()}
                value={detail.claimCount}
              />
            </div>
          </div>

          {/* Recipients (multicast only) */}
          {detail.targetUserIds && detail.targetUserIds.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">
                {m.mail_field_recipients()} ({detail.targetUserIds.length})
              </h3>
              <div className="max-h-60 overflow-auto rounded-lg border bg-card p-3 text-xs">
                <code className="block whitespace-pre-wrap break-all">
                  {detail.targetUserIds.join(", ")}
                </code>
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  )
}

function Header({ title }: { title: string }) {
  return (
    <header className="flex h-14 items-center gap-2 border-b px-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="mx-2 h-4" />
      <h1 className="text-sm font-semibold">{title}</h1>
    </header>
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

function StatCard({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  )
}
