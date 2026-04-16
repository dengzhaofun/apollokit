import { createFileRoute, Link } from "@tanstack/react-router"
import { Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

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
import { useDeleteLevelConfig, useLevelConfigs } from "#/hooks/use-level"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/level/")({
  component: LevelListPage,
})

function LevelListPage() {
  const { data: items, isPending, error } = useLevelConfigs()
  const deleteMutation = useDeleteLevelConfig()

  return (
    <>
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-2 h-4" />
        <h1 className="text-sm font-semibold">{m.level_title()}</h1>
        <div className="ml-auto">
          <Button asChild size="sm">
            <Link to="/level/create">
              <Plus className="size-4" />
              {m.level_new_config()}
            </Link>
          </Button>
        </div>
      </header>

      <main className="flex-1 p-6">
        {isPending ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            {m.common_loading()}
          </div>
        ) : error ? (
          <div className="flex h-40 items-center justify-center text-destructive">
            {m.level_failed_load()} {error.message}
          </div>
        ) : !items?.length ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            {m.level_empty()}
          </div>
        ) : (
          <div className="rounded-xl border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{m.level_col_name()}</TableHead>
                  <TableHead>{m.level_col_alias()}</TableHead>
                  <TableHead>{m.level_col_has_stages()}</TableHead>
                  <TableHead>{m.common_status()}</TableHead>
                  <TableHead>{m.common_sort_order()}</TableHead>
                  <TableHead className="text-right">
                    {m.common_actions()}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((cfg) => (
                  <TableRow key={cfg.id}>
                    <TableCell className="font-medium">
                      <Link
                        to="/level/$configId"
                        params={{ configId: cfg.id }}
                        className="hover:underline"
                      >
                        {cfg.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {cfg.alias ?? m.common_dash()}
                    </TableCell>
                    <TableCell>
                      {cfg.hasStages ? (
                        <Badge variant="secondary">{m.common_yes()}</Badge>
                      ) : (
                        m.common_no()
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={cfg.isActive ? "default" : "outline"}
                      >
                        {cfg.isActive
                          ? m.common_active()
                          : m.common_inactive()}
                      </Badge>
                    </TableCell>
                    <TableCell>{cfg.sortOrder}</TableCell>
                    <TableCell className="flex justify-end gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link
                          to="/level/$configId"
                          params={{ configId: cfg.id }}
                        >
                          {m.common_edit()}
                        </Link>
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={deleteMutation.isPending}
                        onClick={async () => {
                          try {
                            await deleteMutation.mutateAsync(cfg.id)
                            toast.success(m.level_config_deleted())
                          } catch (err) {
                            if (err instanceof ApiError)
                              toast.error(err.body.error)
                            else toast.error(m.level_failed_delete())
                          }
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </main>
    </>
  )
}
