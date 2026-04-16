import { createFileRoute } from "@tanstack/react-router"

import * as m from "#/paraglide/messages.js"
import { Badge } from "#/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card"
import { Separator } from "#/components/ui/separator"
import { SidebarTrigger } from "#/components/ui/sidebar"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import { useGuildSettings, useGuilds } from "#/hooks/use-guild"

export const Route = createFileRoute("/_dashboard/guild/")({
  component: GuildPage,
})

function GuildPage() {
  const { data: settings, isPending: settingsLoading } = useGuildSettings()
  const { data: guilds, isPending: guildsLoading, error: guildsError } = useGuilds()

  return (
    <>
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-2 h-4" />
        <h1 className="text-sm font-semibold">{m.guild_title()}</h1>
      </header>

      <main className="flex-1 space-y-6 p-6">
        {/* Settings card */}
        <Card>
          <CardHeader>
            <CardTitle>{m.guild_settings()}</CardTitle>
          </CardHeader>
          <CardContent>
            {settingsLoading ? (
              <p className="text-muted-foreground">{m.common_loading()}</p>
            ) : settings ? (
              <div className="flex flex-wrap gap-6 text-sm">
                <div>
                  <span className="text-muted-foreground">{m.guild_max_members()}</span>
                  <p className="font-medium">{settings.maxMembers}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">{m.guild_max_officers()}</span>
                  <p className="font-medium">{settings.maxOfficers}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">{m.guild_join_mode()}</span>
                  <p className="font-medium">{settings.joinMode}</p>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">
                {m.guild_no_settings()}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Guilds table */}
        <div className="rounded-xl border bg-card shadow-sm">
          {guildsLoading ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              {m.common_loading()}
            </div>
          ) : guildsError ? (
            <div className="flex h-40 items-center justify-center text-destructive">
              {m.common_failed_to_load({ resource: m.guild_guilds(), error: guildsError.message })}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Leader</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Members</TableHead>
                  <TableHead>Join Mode</TableHead>
                  <TableHead>Active</TableHead>
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
                        <Badge variant="secondary">
                          {guild.leaderUserId}
                        </Badge>
                      </TableCell>
                      <TableCell>{guild.level}</TableCell>
                      <TableCell>
                        {guild.memberCount} / {guild.maxMembers}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{guild.joinMode}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={guild.isActive ? "default" : "destructive"}
                        >
                          {guild.isActive ? "Active" : "Inactive"}
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
          )}
        </div>
      </main>
    </>
  )
}
