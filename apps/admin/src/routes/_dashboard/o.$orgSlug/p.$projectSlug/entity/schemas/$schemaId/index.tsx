import { useTenantParams } from "#/hooks/use-tenant-params";
import { useState } from "react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, Plus, Trash2 } from "lucide-react"
import { useForm } from "@tanstack/react-form"
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
import { FormDialog } from "#/components/ui/form-dialog"
import {
  FormStateBridge,
  type FormBridgeState,
} from "#/components/ui/form-state-bridge"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { Textarea } from "#/components/ui/textarea"
import {
  useAllEntityBlueprints,
  useCreateEntityBlueprint,
  useDeleteEntitySchema,
  useEntitySchema,
} from "#/hooks/use-entity"
import { ApiError } from "#/lib/api-client"
import {
  closedModal,
  modalSearchSchema,
  openCreateModal,
} from "#/lib/modal-search"
import * as m from "#/paraglide/messages.js"

import { PageHeaderActions } from "#/components/PageHeader"

const FORM_ID = "entity-blueprint-mini-create-form"

export const Route = createFileRoute(
  "/_dashboard/o/$orgSlug/p/$projectSlug/entity/schemas/$schemaId/",
)({
  component: SchemaDetailPage,
  validateSearch: modalSearchSchema,
})

function SchemaDetailPage() {
  const { schemaId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = useNavigate()
  const navigateLocal = useNavigate({ from: Route.fullPath })
  const { data: schema, isPending, error } = useEntitySchema(schemaId)
  const { data: blueprints } = useAllEntityBlueprints({ schemaId })
  const deleteMutation = useDeleteEntitySchema()
  const { orgSlug, projectSlug } = useTenantParams()

  function closeModal() {
    void navigateLocal({ search: (prev: Record<string, unknown>) => ({ ...prev, ...closedModal }) })
  }
  function openCreate() {
    void navigateLocal({ search: (prev: Record<string, unknown>) => ({ ...prev, ...openCreateModal }) })
  }

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
        <Button
          render={
            <Link to="/o/$orgSlug/p/$projectSlug/entity/schemas" params={{ orgSlug, projectSlug }}>
              <ArrowLeft className="size-4" />
            </Link>
          }
          variant="ghost" size="icon"
        />
        {schema.alias && (
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
            {schema.alias}
          </code>
        )}
        <div className="ml-auto flex gap-2">
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
                      navigate({ to: "/o/$orgSlug/p/$projectSlug/entity/schemas" , params: { orgSlug, projectSlug }})
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
            <Button size="sm" onClick={openCreate}>
              <Plus className="size-4" />
              {m.entity_new_blueprint()}
            </Button>
          </div>
          <div className="rounded-xl border bg-card shadow-sm">
            <BlueprintTable data={blueprints ?? []} schemaId={schema.id} />
          </div>
        </div>
      </main>

      {search.modal === "create" ? (
        <CreateBlueprintMiniDialog schemaId={schema.id} onClose={closeModal} />
      ) : null}
    </>
  )
}

function CreateBlueprintMiniDialog({
  schemaId,
  onClose,
}: {
  schemaId: string
  onClose: () => void
}) {
  const navigate = useNavigate()
    const { orgSlug, projectSlug } = useTenantParams()
  const mutation = useCreateEntityBlueprint()
  const [formState, setFormState] = useState<FormBridgeState>({
    canSubmit: false,
    isDirty: false,
    isSubmitting: false,
  })

  const form = useForm({
    defaultValues: {
      name: "",
      alias: "",
      description: "",
      rarity: "",
    },
    onSubmit: async ({ value }) => {
      try {
        const row = await mutation.mutateAsync({
          schemaId,
          name: value.name.trim(),
          alias: value.alias.trim() || null,
          description: value.description.trim() || null,
          rarity: value.rarity.trim() || null,
        })
        toast.success(m.entity_blueprint_created())
        onClose()
        void navigate({
          to: "/o/$orgSlug/p/$projectSlug/entity/schemas/$schemaId/blueprints/$blueprintId",
          params: { orgSlug, projectSlug, schemaId, blueprintId: row.id },
        })
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.body.error : "Failed to create blueprint",
        )
      }
    },
  })

  return (
    <FormDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      isDirty={formState.isDirty && !mutation.isPending}
      title={m.entity_new_blueprint()}
      description="Create a blueprint with the essentials. Stats, growth and assets are configured on the next page."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {m.common_cancel()}
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            disabled={!formState.canSubmit || mutation.isPending}
          >
            {mutation.isPending ? m.common_saving() : m.common_create()}
          </Button>
        </>
      }
    >
      <form
        id={FORM_ID}
        onSubmit={(e) => {
          e.preventDefault()
          e.stopPropagation()
          form.handleSubmit()
        }}
        className="space-y-4"
      >
        <form.Subscribe
          selector={(s) => ({
            canSubmit: s.canSubmit,
            isDirty: s.isDirty,
            isSubmitting: s.isSubmitting,
          })}
        >
          {(state) => <FormStateBridge state={state} onChange={setFormState} />}
        </form.Subscribe>

        <form.Field
          name="name"
          validators={{
            onChange: ({ value }) => (!value.trim() ? "Name required" : undefined),
          }}
        >
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor="bp-name">{m.common_name()} *</Label>
              <Input
                id="bp-name"
                required
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            </div>
          )}
        </form.Field>

        <form.Field name="alias">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor="bp-alias">{m.common_alias()}</Label>
              <Input
                id="bp-alias"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="optional, lowercase-with-hyphens"
              />
            </div>
          )}
        </form.Field>

        <form.Field name="rarity">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor="bp-rarity">Rarity</Label>
              <Input
                id="bp-rarity"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="optional, e.g. SSR / Legendary"
              />
            </div>
          )}
        </form.Field>

        <form.Field name="description">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor="bp-desc">{m.common_description()}</Label>
              <Textarea
                id="bp-desc"
                rows={3}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            </div>
          )}
        </form.Field>
      </form>
    </FormDialog>
  )
}
