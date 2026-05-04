import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Pencil, ShieldIcon } from "lucide-react"
import { toast } from "sonner"

import {
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import { useGuildSettings, useGuilds, useUpsertGuildSettings } from "#/hooks/use-guild"
import * as m from "#/paraglide/messages.js"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/guild/")({
  component: GuildPage,
})

function GuildPage() {
  const { data: settings, isPending: settingsLoading } = useGuildSettings()
  const {
    data: guilds,
    isPending: guildsLoading,
    error: guildsError,
    refetch,
  } = useGuilds()
  const upsertMutation = useUpsertGuildSettings()

  const [open, setOpen] = useState(false)
  const [maxMembers, setMaxMembers] = useState(0)
  const [maxOfficers, setMaxOfficers] = useState(0)
  const [joinMode, setJoinMode] = useState("request")

  function openEditDialog() {
    setMaxMembers(settings?.maxMembers ?? 50)
    setMaxOfficers(settings?.maxOfficers ?? 10)
    setJoinMode(settings?.joinMode ?? "request")
    setOpen(true)
  }

  async function handleSave() {
    try {
      await upsertMutation.mutateAsync({ maxMembers, maxOfficers, joinMode })
      setOpen(false)
      toast.success(m.guild_settings_updated())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("保存失败", "Save failed"))
    }
  }

  return (
    <PageShell>
      <PageHeader
        icon={<ShieldIcon className="size-5" />}
        title={t("公会", "Guilds")}
        description={t(
          "查看公会数据 + 容量限制配置",
          "Guild data + capacity & join mode settings",
        )}
        actions={
          <Button variant="outline" size="sm" onClick={openEditDialog}>
            <Pencil className="mr-1.5 size-3.5" />
            {m.common_edit()}
          </Button>
        }
      />

      <PageBody>
        <PageSection title={m.guild_settings()}>
          <Card>
            <CardHeader className="sr-only">
              <CardTitle>{m.guild_settings()}</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              {settingsLoading ? (
                <p className="text-muted-foreground">{m.common_loading()}</p>
              ) : settings ? (
                <div className="flex flex-wrap gap-8 text-sm">
                  <div>
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">
                      {m.guild_max_members()}
                    </span>
                    <p className="mt-1 font-mono text-xl font-semibold">
                      {settings.maxMembers}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">
                      {m.guild_max_officers()}
                    </span>
                    <p className="mt-1 font-mono text-xl font-semibold">
                      {settings.maxOfficers}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">
                      {m.guild_join_mode()}
                    </span>
                    <p className="mt-1 font-medium">
                      <Badge variant="outline">{settings.joinMode}</Badge>
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">{m.guild_no_settings()}</p>
              )}
            </CardContent>
          </Card>
        </PageSection>

        <PageSection title={m.guild_guilds()}>
          {guildsLoading ? (
            <div className="flex h-40 items-center justify-center rounded-lg border bg-card text-muted-foreground">
              {m.common_loading()}
            </div>
          ) : guildsError ? (
            <ErrorState
              title={t("公会加载失败", "Failed to load guilds")}
              onRetry={() => refetch()}
              retryLabel={t("重试", "Retry")}
              error={guildsError instanceof Error ? guildsError : null}
            />
          ) : (
            <div className="rounded-lg border bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("名称", "Name")}</TableHead>
                    <TableHead>{t("会长", "Leader")}</TableHead>
                    <TableHead>{t("等级", "Level")}</TableHead>
                    <TableHead>{t("成员", "Members")}</TableHead>
                    <TableHead>{t("加入方式", "Join Mode")}</TableHead>
                    <TableHead>{t("状态", "Status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {guilds && guilds.length > 0 ? (
                    guilds.map((guild) => (
                      <TableRow key={guild.id}>
                        <TableCell className="font-medium">
                          {guild.name}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{guild.leaderUserId}</Badge>
                        </TableCell>
                        <TableCell className="font-mono">{guild.level}</TableCell>
                        <TableCell className="font-mono">
                          {guild.memberCount} / {guild.maxMembers}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{guild.joinMode}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={guild.isActive ? "default" : "destructive"}
                          >
                            {guild.isActive
                              ? t("活跃", "Active")
                              : t("禁用", "Inactive")}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="h-24 text-center text-muted-foreground"
                      >
                        {m.guild_no_guilds()}
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
            <DialogTitle>{m.guild_settings()}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="max-members">{m.guild_max_members()}</Label>
              <Input
                id="max-members"
                type="number"
                min={1}
                value={maxMembers}
                onChange={(e) => setMaxMembers(Number(e.target.value) || 0)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="max-officers">{m.guild_max_officers()}</Label>
              <Input
                id="max-officers"
                type="number"
                min={0}
                value={maxOfficers}
                onChange={(e) => setMaxOfficers(Number(e.target.value) || 0)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>{m.guild_join_mode()}</Label>
              <Select value={joinMode} onValueChange={setJoinMode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">{t("开放", "Open")}</SelectItem>
                  <SelectItem value="request">{t("申请", "Request")}</SelectItem>
                  <SelectItem value="closed">{t("关闭", "Closed")}</SelectItem>
                </SelectContent>
              </Select>
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
