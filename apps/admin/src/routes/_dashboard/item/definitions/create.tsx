import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import * as m from "#/paraglide/messages.js"

import { DefinitionForm } from "#/components/item/DefinitionForm"
import { useCreateItemDefinition } from "#/hooks/use-item"
import { ApiError } from "#/lib/api-client"

export const Route = createFileRoute("/_dashboard/item/definitions/create")({
  component: CreateDefinitionPage,
})

function CreateDefinitionPage() {
  const navigate = useNavigate()
  const createMutation = useCreateItemDefinition()

  return (
    <>
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-2xl rounded-xl border bg-card p-6 shadow-sm">
          <DefinitionForm
            submitLabel={m.common_create()}
            isPending={createMutation.isPending}
            onSubmit={async (values) => {
              try {
                await createMutation.mutateAsync(values)
                toast.success(m.item_definition_created())
                navigate({ to: "/item" })
              } catch (err) {
                if (err instanceof ApiError) {
                  toast.error(err.body.error)
                } else {
                  toast.error(m.item_failed_create_definition())
                }
              }
            }}
          />
        </div>
      </main>
    </>
  )
}
