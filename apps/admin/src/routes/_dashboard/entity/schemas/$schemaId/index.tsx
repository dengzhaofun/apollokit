import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { BlueprintTable } from "#/components/entity/BlueprintTable"
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
  useEntitySchema,
  useEntityBlueprints,
  useDeleteEntitySchema,
} from "#/hooks/use-entity"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"

import { PageHeaderActions } from "#/components/PageHeader"
export const Route = createFileRoute(
  "/_dashboard/entity/schemas/$schemaId/",
)({
  component: SchemaDetailPage,
})

function SchemaDetailPage() {
  const { schemaId } = Route.useParams()
  const navigate = useNavigate()
  const { data: schema, isPending, error } = useEntitySchema(schemaId)
  const { data: blueprints } = useEntityBlueprints(schemaId)
  const deleteMutation = useDeleteEntitySchema()

  if (isPending) {
    return (
      <div className="flex h-40 items-center justify-center text-muted-foreground">
        {m.common_loading()}
      </div>
    )
  }

  if (error || !schema) {
    return (
      <div className="flex h-40 items-center justify-center text-destructive">
        {error?.message ?? "Not found"}
      </div>
    )
  }

  return (
    <>
      <PageHeaderActions>
        <Button asChild variant="ghost" size="icon">
          <Link to="/entity/schemas">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        {schema.alias && (
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
            {schema.alias}
          </code>
        )}
        <div className="ml-auto flex gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Trash2 className="size-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {m.entity_delete_schema_title()}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {m.entity_delete_schema_desc()}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    try {
                      await deleteMutation.mutateAsync(schema.id)
                      toast.success(m.entity_schema_deleted())
                      navigate({ to: "/entity/schemas" })
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
        </div>
      </PageHeaderActions>

      <main className="flex-1 p-6 space-y-6">
        {/* Schema Info Cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg border p-4">
            <h3 className="text-sm font-medium text-muted-foreground">
              {m.entity_level_config()}
            </h3>
            <p className="mt-1 font-medium">
              {schema.levelConfig.enabled ? (
                <Badge>Lv.1 → {schema.levelConfig.maxLevel}</Badge>
              ) : (
                <Badge variant="outline">{m.entity_disabled()}</Badge>
              )}
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <h3 className="text-sm font-medium text-muted-foreground">
              {m.entity_rank_config()}
            </h3>
            <p className="mt-1 flex gap-1 flex-wrap">
              {schema.rankConfig.enabled ? (
                schema.rankConfig.ranks.map((r) => (
                  <Badge key={r.key} variant="secondary">
                    {r.label}
                  </Badge>
                ))
              ) : (
                <Badge variant="outline">{m.entity_disabled()}</Badge>
              )}
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <h3 className="text-sm font-medium text-muted-foreground">
              {m.entity_synthesis_config()}
            </h3>
            <p className="mt-1 font-medium">
              {schema.synthesisConfig.enabled ? (
                <Badge>
                  {schema.synthesisConfig.inputCount}x →
                  {schema.synthesisConfig.sameBlueprint ? " same" : " any"}
                </Badge>
              ) : (
                <Badge variant="outline">{m.entity_disabled()}</Badge>
              )}
            </p>
          </div>
        </div>

        {/* Stats */}
        {schema.statDefinitions.length > 0 && (
          <div className="rounded-lg border p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">
              {m.entity_stat_definitions()}
            </h3>
            <div className="flex flex-wrap gap-2">
              {schema.statDefinitions.map((s) => (
                <Badge key={s.key} variant="secondary">
                  {s.label} ({s.key}: {s.type})
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Tags */}
        {schema.tagDefinitions.length > 0 && (
          <div className="rounded-lg border p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">
              {m.entity_tag_definitions()}
            </h3>
            <div className="space-y-2">
              {schema.tagDefinitions.map((t) => (
                <div key={t.key} className="flex items-center gap-2">
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                    {t.key}
                  </code>
                  <span className="text-sm text-muted-foreground">
                    {t.label}:
                  </span>
                  <div className="flex gap-1">
                    {t.values.map((v) => (
                      <Badge key={v} variant="outline">
                        {v}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Slot Definitions */}
        {schema.slotDefinitions.length > 0 && (
          <div className="rounded-lg border p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">
              {m.entity_slot_definitions()}
            </h3>
            <div className="space-y-2">
              {schema.slotDefinitions.map((s) => (
                <div key={s.key} className="flex items-center gap-2">
                  <Badge variant="secondary">
                    {s.label} ({s.key}) x{s.maxCount}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Blueprints */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">{m.entity_blueprints()}</h2>
            <Button asChild size="sm">
              <Link
                to="/entity/schemas/$schemaId/blueprints/create"
                params={{ schemaId: schema.id }}
              >
                <Plus className="size-4" />
                {m.entity_new_blueprint()}
              </Link>
            </Button>
          </div>
          <div className="rounded-xl border bg-card shadow-sm">
            <BlueprintTable data={blueprints ?? []} schemaId={schema.id} />
          </div>
        </div>
      </main>
    </>
  )
}
