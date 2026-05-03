import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { useForm } from "@tanstack/react-form"
import { toast } from "sonner"

import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { Switch } from "#/components/ui/switch"
import { useCreateEntityFormationConfig } from "#/hooks/use-entity"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"

import { PageHeaderActions } from "#/components/PageHeader"
export const Route = createFileRoute(
  "/_dashboard/o/$orgSlug/p/$projectSlug/entity/formations/create",
)({
  component: FormationConfigCreatePage,
})

function FormationConfigCreatePage() {
  const navigate = useNavigate()
  const createMutation = useCreateEntityFormationConfig()

  const form = useForm({
    defaultValues: {
      name: "",
      alias: "",
      maxFormations: 5,
      maxSlots: 4,
      allowDuplicateBlueprints: false,
    },
    onSubmit: async ({ value }) => {
      try {
        await createMutation.mutateAsync({
          name: value.name,
          alias: value.alias || null,
          maxFormations: value.maxFormations,
          maxSlots: value.maxSlots,
          allowDuplicateBlueprints: value.allowDuplicateBlueprints,
        })
        toast.success(m.entity_formation_created())
        navigate({ to: "/entity/formations" })
      } catch (err) {
        if (err instanceof ApiError) {
          toast.error(err.body.error)
        } else {
          toast.error(String(err))
        }
      }
    },
  })

  return (
    <>
      <PageHeaderActions>
        <Button
          render={
            <Link to="/entity/formations">
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
                      placeholder="Default Formation"
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
                      placeholder="default"
                    />
                  </div>
                )}
              </form.Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <form.Field name="maxFormations">
                {(field) => (
                  <div className="space-y-2">
                    <Label>{m.entity_max_formations()}</Label>
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      value={field.state.value}
                      onChange={(e) =>
                        field.handleChange(Number(e.target.value))
                      }
                    />
                  </div>
                )}
              </form.Field>

              <form.Field name="maxSlots">
                {(field) => (
                  <div className="space-y-2">
                    <Label>{m.entity_max_slots()}</Label>
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      value={field.state.value}
                      onChange={(e) =>
                        field.handleChange(Number(e.target.value))
                      }
                    />
                  </div>
                )}
              </form.Field>
            </div>

            <form.Field name="allowDuplicateBlueprints">
              {(field) => (
                <div className="flex items-center gap-2">
                  <Switch
                    checked={field.state.value}
                    onCheckedChange={field.handleChange}
                  />
                  <Label>{m.entity_allow_duplicate_blueprints()}</Label>
                </div>
              )}
            </form.Field>

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
