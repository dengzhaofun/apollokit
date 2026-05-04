import { useTenantParams } from "#/hooks/use-tenant-params";
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"

import { TypeForm } from "#/components/cms/TypeForm"
import { useCreateCmsType } from "#/hooks/use-cms"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/cms/types/create")({
  component: CmsTypeCreatePage,
})

function CmsTypeCreatePage() {
  const navigate = useNavigate()
    const { orgSlug, projectSlug } = useTenantParams()
  const mutation = useCreateCmsType()

  return (
    <main className="flex-1 p-6">
      <div className="mx-auto max-w-4xl rounded-xl border bg-card p-6 shadow-sm">
        <TypeForm
          isPending={mutation.isPending}
          submitLabel={m.cms_submit_create_type()}
          onSubmit={async (values) => {
            try {
              const row = await mutation.mutateAsync(values)
              toast.success(m.cms_type_created())
              navigate({
                to: "/o/$orgSlug/p/$projectSlug/cms/$typeAlias",
                params: { orgSlug, projectSlug, typeAlias: row.alias },
              })
            } catch (err) {
              if (err instanceof ApiError) toast.error(err.body.error)
              else toast.error(m.cms_type_failed_create())
            }
          }}
        />
      </div>
    </main>
  )
}
