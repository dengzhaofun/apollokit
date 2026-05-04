import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { HeartHandshakeIcon, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"

import {
  confirm,
  ErrorState,
  PageBody,
  PageHeader,
  PageSection,
  PageShell,
} from "#/components/patterns"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import {
  useDeleteFriendRelationship,
  useFriendRelationships,
  useFriendSettings,
  useUpsertFriendSettings,
} from "#/hooks/use-friend"
import * as m from "#/paraglide/messages.js"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/friend/")({
  component: FriendPage,
})

function FriendPage() {
  const { data: settings, isPending: settingsLoading } = useFriendSettings()
  const {
    data: relationships,
    isPending: relLoading,
    error: relError,
    refetch,
  } = useFriendRelationships()
  const deleteMutation = useDeleteFriendRelationship()
  const upsertMutation = useUpsertFriendSettings()

  const [open, setOpen] = useState(false)
  const [maxFriends, setMaxFriends] = useState(0)
  const [maxBlocked, setMaxBlocked] = useState(0)
  const [maxPending, setMaxPending] = useState(0)

  function openEditDialog() {
    setMaxFriends(settings?.maxFriends ?? 200)
    setMaxBlocked(settings?.maxBlocked ?? 100)
    setMaxPending(settings?.maxPendingRequests ?? 50)
    setOpen(true)
  }

  async function handleSave() {
    try {
      await upsertMutation.mutateAsync({
        maxFriends,
        maxBlocked,
        maxPendingRequests: maxPending,
      })
      setOpen(false)
      toast.success(m.friend_settings_updated())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("保存失败", "Save failed"))
    }
  }

  return (
    <PageShell>
      <PageHeader
        icon={<HeartHandshakeIcon className="size-5" />}
        title={t("好友关系", "Friends")}
        description={t(
          "查看好友关系数据 + 容量限制配置",
          "Friend relationship data + capacity limit settings",
        )}
        actions={
          <Button variant="outline" size="sm" onClick={openEditDialog}>
            <Pencil className="mr-1.5 size-3.5" />
            {m.common_edit()}
          </Button>
        }
      />

      <PageBody>
        {/* Settings */}
        <PageSection title={m.friend_settings()}>
          <Card>
            <CardHeader className="sr-only">
              <CardTitle>{m.friend_settings()}</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              {settingsLoading ? (
                <p className="text-muted-foreground">{m.common_loading()}</p>
              ) : settings ? (
                <div className="flex flex-wrap gap-8 text-sm">
                  <div>
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">
                      {m.friend_max_friends()}
                    </span>
                    <p className="mt-1 font-mono text-xl font-semibold">
                      {settings.maxFriends}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">
                      {m.friend_max_blocked()}
                    </span>
                    <p className="mt-1 font-mono text-xl font-semibold">
                      {settings.maxBlocked}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">
                      {m.friend_max_pending()}
                    </span>
                    <p className="mt-1 font-mono text-xl font-semibold">
                      {settings.maxPendingRequests}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">{m.friend_no_settings()}</p>
              )}
            </CardContent>
          </Card>
        </PageSection>

        {/* Relationships */}
        <PageSection title={m.friend_relationships()}>
          {relLoading ? (
            <div className="flex h-40 items-center justify-center rounded-lg border bg-card text-muted-foreground">
              {m.common_loading()}
            </div>
          ) : relError ? (
            <ErrorState
              title={t("好友关系加载失败", "Failed to load relationships")}
              onRetry={() => refetch()}
              retryLabel={t("重试", "Retry")}
              error={relError instanceof Error ? relError : null}
            />
          ) : (
            <div className="rounded-lg border bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User A</TableHead>
                    <TableHead>User B</TableHead>
                    <TableHead>{t("建立时间", "Created at")}</TableHead>
                    <TableHead className="w-16" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {relationships && relationships.length > 0 ? (
                    relationships.map((rel) => (
                      <TableRow key={rel.id}>
                        <TableCell>
                          <Badge variant="secondary">{rel.userA}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{rel.userB}</Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(rel.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              const ok = await confirm({
                                title: t(
                                  "解除好友关系?",
                                  "Remove friendship?",
                                ),
                                description: t(
                                  `${rel.userA} ↔ ${rel.userB} 的关系被移除后,双方都会失去好友状态,不可恢复。`,
                                  `${rel.userA} ↔ ${rel.userB}: both sides will lose friend status. Not reversible.`,
                                ),
                                confirmLabel: m.common_delete(),
                                danger: true,
                              })
                              if (!ok) return
                              deleteMutation.mutate(rel.id, {
                                onSuccess: () =>
                                  toast.success(
                                    m.friend_relationship_deleted(),
                                  ),
                              })
                            }}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="h-24 text-center text-muted-foreground"
                      >
                        {m.friend_no_relationships()}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </PageSection>
      </PageBody>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{m.friend_settings()}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="max-friends">{m.friend_max_friends()}</Label>
              <Input
                id="max-friends"
                type="number"
                min={1}
                value={maxFriends}
                onChange={(e) => setMaxFriends(Number(e.target.value) || 0)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="max-blocked">{m.friend_max_blocked()}</Label>
              <Input
                id="max-blocked"
                type="number"
                min={0}
                value={maxBlocked}
                onChange={(e) => setMaxBlocked(Number(e.target.value) || 0)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="max-pending">{m.friend_max_pending()}</Label>
              <Input
                id="max-pending"
                type="number"
                min={0}
                value={maxPending}
                onChange={(e) => setMaxPending(Number(e.target.value) || 0)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {m.common_cancel()}
            </Button>
            <Button onClick={handleSave} disabled={upsertMutation.isPending}>
              {m.common_save()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}
