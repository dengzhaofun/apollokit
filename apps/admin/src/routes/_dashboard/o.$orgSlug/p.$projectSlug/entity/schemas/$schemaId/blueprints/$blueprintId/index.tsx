import { useTenantParams } from "#/hooks/use-tenant-params";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { SkinTable } from "#/components/entity/SkinTable"
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
import {
  useEntityBlueprint,
  useEntitySkins,
  useDeleteEntityBlueprint,
} from "#/hooks/use-entity"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"
import { PageHeader } from "#/components/patterns"

export const Route = createFileRoute(
  "/_dashboard/o/$orgSlug/p/$projectSlug/entity/schemas/$schemaId/blueprints/$blueprintId/",
)({
  component: BlueprintDetailPage,
})

function BlueprintDetailPage() {
  const { schemaId, blueprintId } = Route.useParams()
  const navigate = useNavigate()
  const { data: bp, isPending, error } = useEntityBlueprint(blueprintId)
  const { data: skins } = useEntitySkins(blueprintId)
  const deleteMutation = useDeleteEntityBlueprint()
  const { orgSlug, projectSlug } = useTenantParams()

  if (isPending) {
    return (
      <div className="flex h-40 items-center justify-center text-muted-foreground">
        {m.common_loading()}
      </div>
    )
  }

  if (error || !bp) {
    return (
      <div className="flex h-40 items-center justify-center text-destructive">
        {error?.message ?? "Not found"}
      </div>
    )
  }

  return (
    <>
      <PageHeader
        title={bp.name}
        actions={
          <>
            <Button
              render={
                <Link
                  to="/o/$orgSlug/p/$projectSlug/entity/schemas/$schemaId"
                  params={{ orgSlug, projectSlug, schemaId }}
                >
                  <ArrowLeft className="size-4" />
                </Link>
              }
              variant="ghost" size="icon"
            />
            {bp.rarity && <Badge variant="secondary">{bp.rarity}</Badge>}
            {bp.alias && (
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                {bp.alias}
              </code>
            )}
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button variant="destructive" size="sm">
                    <Trash2 className="size-4" />
                  </Button>
                }
              />
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {m.entity_delete_blueprint_title()}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {m.entity_delete_blueprint_desc()}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={async () => {
                      try {
                        await deleteMutation.mutateAsync(bp.id)
                        toast.success(m.entity_blueprint_deleted())
                        navigate({
                          to: "/o/$orgSlug/p/$projectSlug/entity/schemas/$schemaId",
                          params: { orgSlug, projectSlug, schemaId },
                        })
                      } catch (err) {
                        if (err instanceof ApiError) toast.error(err.body.error)
                      }
                    }}
                  >
                    {m.common_delete()}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        }
      />

      <main className="flex-1 p-6 space-y-6">
        {/* Tags */}
        {Object.keys(bp.tags).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(bp.tags).map(([k, v]) => (
              <Badge key={k} variant="outline">
                {k}: {v}
              </Badge>
            ))}
          </div>
        )}

        {/* Stats */}
        {(Object.keys(bp.baseStats).length > 0 ||
          Object.keys(bp.statGrowth).length > 0) && (
          <div className="rounded-lg border p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">
              {m.entity_base_stats()} / {m.entity_stat_growth()}
            </h3>
            <div className="grid grid-cols-4 gap-3">
              {Object.entries(bp.baseStats).map(([key, val]) => (
                <div key={key} className="text-center rounded-lg bg-muted/50 p-2">
                  <div className="text-xs text-muted-foreground">{key}</div>
                  <div className="text-lg font-bold">{val}</div>
                  {bp.statGrowth[key] !== undefined && (
                    <div className="text-xs text-green-600">
                      +{bp.statGrowth[key]}/Lv
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Assets */}
        {Object.keys(bp.assets).length > 0 && (
          <div className="rounded-lg border p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">
              {m.entity_assets()}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(bp.assets).map(([k, v]) => (
                <div key={k} className="flex items-center gap-2 text-sm">
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">{k}</code>
                  <span className="truncate text-muted-foreground">{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Skins */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">{m.entity_skins()}</h2>
            <Button
              render={
                <Link
                  to="/o/$orgSlug/p/$projectSlug/entity/schemas/$schemaId/blueprints/$blueprintId/skins/create"
                  params={{ orgSlug, projectSlug, schemaId, blueprintId: bp.id }}
                >
                  <Plus className="size-4" />
                  {m.entity_new_skin()}
                </Link>
              }
              size="sm"
            />
          </div>
          <div className="rounded-xl border bg-card shadow-sm">
            <SkinTable data={skins ?? []} />
          </div>
        </div>
      </main>
    </>
  )
}
