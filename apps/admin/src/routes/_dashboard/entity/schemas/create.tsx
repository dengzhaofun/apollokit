import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { toast } from "sonner"

import { SchemaForm } from "#/components/entity/SchemaForm"
import { Button } from "#/components/ui/button"
import { useCreateEntitySchema } from "#/hooks/use-entity"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"

import { PageHeaderActions } from "#/components/PageHeader"
export const Route = createFileRoute("/_dashboard/entity/schemas/create")({
  component: SchemaCreatePage,
})

function SchemaCreatePage() {
  const navigate = useNavigate()
  const createMutation = useCreateEntitySchema()

  return (
    <>
      <PageHeaderActions>
        <Button asChild variant="ghost" size="icon">
          <Link to="/entity">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
      </PageHeaderActions>

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-3xl rounded-xl border bg-card p-6 shadow-sm">
          <SchemaForm
            submitLabel={m.common_create()}
            isPending={createMutation.isPending}
            onSubmit={async (values) => {
              try {
                const row = await createMutation.mutateAsync(values)
                toast.success(m.entity_schema_created())
                navigate({
                  to: "/entity/schemas/$schemaId",
                  params: { schemaId: row.id },
                })
              } catch (err) {
                if (err instanceof ApiError) {
                  toast.error(err.body.error)
                } else {
                  toast.error(String(err))
                }
              }
            }}
          />
        </div>
      </main>
    </>
  )
}
