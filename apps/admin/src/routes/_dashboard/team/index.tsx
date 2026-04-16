import { createFileRoute, Link } from "@tanstack/react-router"
import { Plus } from "lucide-react"

import * as m from "#/paraglide/messages.js"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
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
import { useTeamConfigs } from "#/hooks/use-team"

export const Route = createFileRoute("/_dashboard/team/")({
  component: TeamPage,
})

function TeamPage() {
  const { data: configs, isPending, error } = useTeamConfigs()

  return (
    <>
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-2 h-4" />
        <h1 className="text-sm font-semibold">{m.team_title()}</h1>
        <div className="ml-auto">
          <Button size="sm" asChild>
            <Link to="/team/create">
              <Plus className="size-4" />
              {m.team_new_config()}
            </Link>
          </Button>
        </div>
      </header>

      <main className="flex-1 p-6">
        <div className="rounded-xl border bg-card shadow-sm">
          {isPending ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              {m.common_loading()}
            </div>
          ) : error ? (
            <div className="flex h-40 items-center justify-center text-destructive">
              {m.common_failed_to_load({ resource: m.team_title(), error: error.message })}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{m.common_name()}</TableHead>
                  <TableHead>{m.common_alias()}</TableHead>
                  <TableHead>{m.team_max_members()}</TableHead>
                  <TableHead>{m.team_auto_dissolve()}</TableHead>
                  <TableHead>{m.team_quick_match()}</TableHead>
                  <TableHead>{m.common_created()}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configs && configs.length > 0 ? (
                  configs.map((cfg) => (
                    <TableRow key={cfg.id}>
                      <TableCell className="font-medium">
                        <Link
                          to="/team/$configId"
                          params={{ configId: cfg.id }}
                          className="hover:underline"
                        >
                          {cfg.name}
                        </Link>
                      </TableCell>
                      <TableCell>{cfg.alias ?? "-"}</TableCell>
                      <TableCell>{cfg.maxMembers}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            cfg.autoDissolveOnLeaderLeave
                              ? "default"
                              : "secondary"
                          }
                        >
                          {cfg.autoDissolveOnLeaderLeave ? "Yes" : "No"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            cfg.allowQuickMatch ? "default" : "secondary"
                          }
                        >
                          {cfg.allowQuickMatch ? "Yes" : "No"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(cfg.createdAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-24 text-center text-muted-foreground"
                    >
                      {m.team_no_configs()}
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
