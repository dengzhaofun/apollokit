import { useTenantParams } from "#/hooks/use-tenant-params";
/**
 * End-user detail + actions page.
 *
 * Read-only identity card + narrow edit form (name / image /
 * emailVerified) + auth accounts + active sessions + danger zone.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  Crown,
  KeyRound,
  LinkIcon,
  LogOut,
  Monitor,
  ShieldBan,
  Trash2,
  X,
} from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { PageHeader } from "#/components/patterns"
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
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { Switch } from "#/components/ui/switch"
import {
  useDeleteEndUser,
  useDisableEndUser,
  useEnableEndUser,
  useEndUser,
  useSignOutEndUser,
  useUpdateEndUser,
} from "#/hooks/use-end-user"
import { useUserAccounts } from "#/hooks/use-end-user-account"
import { useUserSessions, useRevokeEndUserSession } from "#/hooks/use-end-user-session"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/end-user/$id")({
  component: EndUserDetailPage,
})

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.body.error
  if (err instanceof Error) return err.message
  return String(err)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString()
}

function EndUserDetailPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()

  const { data, isPending, error } = useEndUser(id)
  const updateMutation = useUpdateEndUser()
  const disableMutation = useDisableEndUser()
  const enableMutation = useEnableEndUser()
  const signOutMutation = useSignOutEndUser()
  const deleteMutation = useDeleteEndUser()
  const { orgSlug, projectSlug } = useTenantParams()

  const { data: accounts } = useUserAccounts(id)
  const { data: sessions } = useUserSessions(id)
  const revokeSessionMutation = useRevokeEndUserSession()

  const [name, setName] = useState("")
  const [image, setImage] = useState("")
  const [emailVerified, setEmailVerified] = useState(false)

  useEffect(() => {
    if (!data) return
    setName(data.name)
    setImage(data.image ?? "")
    setEmailVerified(data.emailVerified)
  }, [data])

  return (
    <>
      <PageHeader
        title="用户详情"
        actions={
          <Button
            render={
              <Link to="/o/$orgSlug/p/$projectSlug/end-user" params={{ orgSlug, projectSlug }}>
                <ArrowLeft className="size-4" />
                {m.end_user_detail_back()}
              </Link>
            }
            variant="ghost" size="sm"
          />
        }
      />

      <main className="flex-1 p-6">
        {isPending ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            {m.end_user_loading()}
          </div>
        ) : error ? (
          <div className="mx-auto max-w-2xl rounded-xl border bg-card p-6 text-center shadow-sm">
            <h2 className="font-semibold">
              {m.end_user_detail_not_found_title()}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {m.end_user_detail_not_found_description()}
            </p>
            <Button
              render={
                <Link to="/o/$orgSlug/p/$projectSlug/end-user" params={{ orgSlug, projectSlug }}>{m.end_user_detail_back()}</Link>
              }
              variant="outline" size="sm" className="mt-4"
            />
          </div>
        ) : data ? (
          <div className="mx-auto grid max-w-4xl gap-6">
            {/* Identity card */}
            <div className="rounded-xl border bg-card p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  {m.end_user_detail_section_identity()}
                </h2>
                <div className="flex items-center gap-2">
                  {data.origin === "managed" ? (
                    <Badge variant="secondary" className="gap-1">
                      <Crown className="size-3" />
                      {m.end_user_origin_managed()}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1">
                      <LinkIcon className="size-3" />
                      {m.end_user_origin_synced()}
                    </Badge>
                  )}
                  {data.disabled ? (
                    <Badge variant="destructive" className="gap-1">
                      <Ban className="size-3" />
                      {m.end_user_status_disabled()}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1">
                      <CheckCircle2 className="size-3" />
                      {m.end_user_status_enabled()}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-muted-foreground">
                    {m.end_user_detail_field_id()}
                  </Label>
                  <p className="font-mono text-xs">{data.id}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">
                    {m.end_user_detail_field_email()}
                  </Label>
                  <p className="text-sm">{data.email}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">
                    {m.end_user_detail_field_external_id()}
                  </Label>
                  <p className="font-mono text-xs">
                    {data.externalId ?? "—"}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">
                    {m.end_user_detail_field_session_count()}
                  </Label>
                  <p className="text-sm tabular-nums">{data.sessionCount}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">
                    {m.end_user_detail_field_created_at()}
                  </Label>
                  <p className="text-sm">{formatDate(data.createdAt)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">
                    {m.end_user_detail_field_updated_at()}
                  </Label>
                  <p className="text-sm">{formatDate(data.updatedAt)}</p>
                </div>
              </div>
            </div>

            {/* Edit form — no heading, the fields themselves label
                the shape; the read-only Identity card above already
                owns the "Identity" label. */}
            <div className="rounded-xl border bg-card p-6 shadow-sm">
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">
                    {m.end_user_detail_field_name()}
                  </Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="image">
                    {m.end_user_detail_field_image()}
                  </Label>
                  <Input
                    id="image"
                    value={image}
                    onChange={(e) => setImage(e.target.value)}
                    placeholder="https://..."
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <Label htmlFor="emailVerified" className="cursor-pointer">
                    {m.end_user_detail_field_email_verified()}
                  </Label>
                  <Switch
                    id="emailVerified"
                    checked={emailVerified}
                    onCheckedChange={setEmailVerified}
                  />
                </div>
                <div>
                  <Button
                    disabled={updateMutation.isPending}
                    onClick={async () => {
                      try {
                        await updateMutation.mutateAsync({
                          id: data.id,
                          input: {
                            name,
                            image: image.trim() ? image : null,
                            emailVerified,
                          },
                        })
                        toast.success(m.end_user_detail_toast_saved())
                      } catch (err) {
                        toast.error(
                          m.end_user_detail_toast_save_failed({
                            message: errorMessage(err),
                          }),
                        )
                      }
                    }}
                  >
                    {m.end_user_detail_action_save()}
                  </Button>
                </div>
              </div>
            </div>

            {/* Auth Accounts */}
            <div className="rounded-xl border bg-card p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <KeyRound className="size-4 text-muted-foreground" />
                <h2 className="text-lg font-semibold">
                  {t("认证方式", "Auth Accounts")}
                </h2>
              </div>
              {!accounts ? (
                <p className="text-sm text-muted-foreground">{t("加载中…", "Loading…")}</p>
              ) : accounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("暂无认证账号", "No auth accounts")}</p>
              ) : (
                <div className="grid gap-2">
                  {accounts.map((acc) => (
                    <div
                      key={acc.id}
                      className="flex items-center justify-between rounded-lg border px-3 py-2"
                    >
                      {acc.providerId === "credential" ? (
                        <Badge variant="secondary" className="gap-1">
                          <KeyRound className="size-3" />
                          {t("邮箱密码", "Credential")}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1">
                          <LinkIcon className="size-3" />
                          {acc.providerId}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {t("绑定于", "Linked")} {new Date(acc.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Active Sessions */}
            <div className="rounded-xl border bg-card p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <Monitor className="size-4 text-muted-foreground" />
                <h2 className="text-lg font-semibold">
                  {t("活跃会话", "Active Sessions")}
                </h2>
              </div>
              {!sessions ? (
                <p className="text-sm text-muted-foreground">{t("加载中…", "Loading…")}</p>
              ) : sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("暂无活跃会话", "No active sessions")}</p>
              ) : (
                <div className="grid gap-2">
                  {sessions.map((sess) => (
                    <div
                      key={sess.id}
                      className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs text-muted-foreground">
                          {sess.ipAddress ?? t("未知 IP", "Unknown IP")}
                          {sess.userAgent ? ` · ${sess.userAgent}` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {t("过期", "Expires")} {new Date(sess.expiresAt).toLocaleString()}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0 text-destructive hover:text-destructive"
                        disabled={revokeSessionMutation.isPending}
                        onClick={async () => {
                          try {
                            await revokeSessionMutation.mutateAsync({ userId: id, sessionId: sess.id })
                            toast.success(t("已撤销会话", "Session revoked"))
                          } catch (err) {
                            toast.error(errorMessage(err))
                          }
                        }}
                      >
                        <X className="size-3.5" />
                        {t("撤销", "Revoke")}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Danger zone */}
            <div className="rounded-xl border border-destructive/40 bg-card p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-destructive">
                {m.end_user_detail_section_danger()}
              </h2>
              <div className="grid gap-3">
                {/* Sign-out all */}
                <AlertDialog>
                  <AlertDialogTrigger
                    render={
                      <Button
                        variant="outline"
                        className="justify-start"
                        disabled={signOutMutation.isPending}
                      >
                        <LogOut className="size-4" />
                        {m.end_user_detail_action_sign_out_all()}
                      </Button>
                    }
                  />
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {m.end_user_detail_sign_out_all_confirm_title()}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {m.end_user_detail_sign_out_all_confirm_description()}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>
                        {m.rank_cancel()}
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={async () => {
                          try {
                            const r = await signOutMutation.mutateAsync(
                              data.id,
                            )
                            toast.success(
                              m.end_user_detail_toast_signed_out({
                                count: r.revoked,
                              }),
                            )
                          } catch (err) {
                            toast.error(errorMessage(err))
                          }
                        }}
                      >
                        {m.rank_delete_confirm()}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                {/* Disable / enable */}
                {data.disabled ? (
                  <Button
                    variant="outline"
                    className="justify-start"
                    disabled={enableMutation.isPending}
                    onClick={async () => {
                      try {
                        await enableMutation.mutateAsync(data.id)
                        toast.success(m.end_user_detail_toast_enabled())
                      } catch (err) {
                        toast.error(errorMessage(err))
                      }
                    }}
                  >
                    <CheckCircle2 className="size-4" />
                    {m.end_user_detail_action_enable()}
                  </Button>
                ) : (
                  <AlertDialog>
                    <AlertDialogTrigger
                      render={
                        <Button
                          variant="outline"
                          className="justify-start text-destructive"
                          disabled={disableMutation.isPending}
                        >
                          <ShieldBan className="size-4" />
                          {m.end_user_detail_action_disable()}
                        </Button>
                      }
                    />
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          {m.end_user_detail_disable_confirm_title()}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {m.end_user_detail_disable_confirm_description()}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>
                          {m.rank_cancel()}
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={async () => {
                            try {
                              await disableMutation.mutateAsync(data.id)
                              toast.success(
                                m.end_user_detail_toast_disabled(),
                              )
                            } catch (err) {
                              toast.error(errorMessage(err))
                            }
                          }}
                        >
                          {m.rank_delete_confirm()}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}

                {/* Delete */}
                <AlertDialog>
                  <AlertDialogTrigger
                    render={
                      <Button
                        variant="destructive"
                        className="justify-start"
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="size-4" />
                        {m.end_user_detail_action_delete()}
                      </Button>
                    }
                  />
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {m.end_user_detail_delete_confirm_title()}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {m.end_user_detail_delete_confirm_description()}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>
                        {m.rank_cancel()}
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={async () => {
                          try {
                            await deleteMutation.mutateAsync(data.id)
                            toast.success(m.end_user_detail_toast_deleted())
                            navigate({ to: "/o/$orgSlug/p/$projectSlug/end-user" , params: { orgSlug, projectSlug }})
                          } catch (err) {
                            toast.error(errorMessage(err))
                          }
                        }}
                      >
                        {m.rank_delete_confirm()}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </>
  )
}
