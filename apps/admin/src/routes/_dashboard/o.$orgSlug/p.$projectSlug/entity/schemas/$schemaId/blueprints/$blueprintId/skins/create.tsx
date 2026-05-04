import { useTenantParams } from "#/hooks/use-tenant-params";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { useForm } from "@tanstack/react-form"
import { toast } from "sonner"

import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { Switch } from "#/components/ui/switch"
import { useCreateEntitySkin } from "#/hooks/use-entity"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"

import { PageHeaderActions } from "#/components/PageHeader"
export const Route = createFileRoute(
  "/_dashboard/o/$orgSlug/p/$projectSlug/entity/schemas/$schemaId/blueprints/$blueprintId/skins/create",
)({
  component: SkinCreatePage,
})

function SkinCreatePage() {
  const { schemaId, blueprintId } = Route.useParams()
  const navigate = useNavigate()
  const createMutation = useCreateEntitySkin()

  const form = useForm({
    defaultValues: {
      name: "",
      alias: "",
      rarity: "",
      isDefault: false,
      sortOrder: 0,
      isActive: true,
    },
    onSubmit: async ({ value }) => {
      try {
        await createMutation.mutateAsync({
          blueprintId,
          name: value.name,
          alias: value.alias || null,
          rarity: value.rarity || null,
          isDefault: value.isDefault,
          isActive: value.isActive,
        })
        toast.success(m.entity_skin_created())
        navigate({
          to: "/o/$orgSlug/p/$projectSlug/entity/schemas/$schemaId/blueprints/$blueprintId",
          params: { orgSlug, projectSlug, schemaId, blueprintId },
        })
      } catch (err) {
        if (err instanceof ApiError) {
          toast.error(err.body.error)
        } else {
          toast.error(String(err))
        }
      }
    },
  })
  const { orgSlug, projectSlug } = useTenantParams()

  return (
    <>
      <PageHeaderActions>
        <Button
          render={
            <Link
              to="/o/$orgSlug/p/$projectSlug/entity/schemas/$schemaId/blueprints/$blueprintId"
              params={{ orgSlug, projectSlug, schemaId, blueprintId }}
            >
              <ArrowLeft className="size-4" />
            </Link>
          }
          variant="ghost" size="icon"
        />
      </PageHeaderActions>

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-2xl rounded-xl border bg-card p-6 shadow-sm">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              form.handleSubmit()
            }}
            className="space-y-6"
          >
            <div className="grid grid-cols-2 gap-4">
              <form.Field
                name="name"
                validators={{
                  onChange: ({ value }) =>
                    !value ? m.common_required() : undefined,
                }}
              >
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={field.name}>{m.common_name()} *</Label>
                    <Input
                      id={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                    {field.state.meta.errors.length > 0 && (
                      <p className="text-sm text-destructive">
                        {field.state.meta.errors[0]}
                      </p>
                    )}
                  </div>
                )}
              </form.Field>

              <form.Field name="alias">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={field.name}>{m.common_alias()}</Label>
                    <Input
                      id={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  </div>
                )}
              </form.Field>
            </div>

            <form.Field name="rarity">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>{m.entity_rarity()}</Label>
                  <Input
                    id={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="SSR"
                  />
                </div>
              )}
            </form.Field>

            <div className="flex items-center gap-4">
              <form.Field name="isDefault">
                {(field) => (
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={field.state.value}
                      onCheckedChange={field.handleChange}
                    />
                    <Label>{m.entity_is_default()}</Label>
                  </div>
                )}
              </form.Field>

              <form.Field name="isActive">
                {(field) => (
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={field.state.value}
                      onCheckedChange={field.handleChange}
                    />
                    <Label>{m.common_active()}</Label>
                  </div>
                )}
              </form.Field>
            </div>

            <form.Subscribe selector={(s) => s.canSubmit}>
              {(canSubmit) => (
                <Button
                  type="submit"
                  disabled={!canSubmit || createMutation.isPending}
                >
                  {createMutation.isPending
                    ? m.common_saving()
                    : m.common_create()}
                </Button>
              )}
            </form.Subscribe>
          </form>
        </div>
      </main>
    </>
  )
}
