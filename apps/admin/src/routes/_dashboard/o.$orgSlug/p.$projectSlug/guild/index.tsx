import { createFileRoute } from "@tanstack/react-router"
import { ShieldIcon } from "lucide-react"

import {
  ErrorState,
  PageBody,
  PageHeader,
  PageSection,
  PageShell,
} from "#/components/patterns"
import { Badge } from "#/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import { useGuildSettings, useGuilds } from "#/hooks/use-guild"
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

  return (
    <PageShell>
      <PageHeader
        icon={<ShieldIcon className="size-5" />}
        title={t("公会", "Guilds")}
        description={t(
          "查看公会数据 + 容量限制配置",
          "Guild data + capacity & join mode settings",
        )}
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
    </PageShell>
  )
}
