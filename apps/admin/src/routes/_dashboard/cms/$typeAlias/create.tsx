import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"

import { EntryForm } from "#/components/cms/EntryForm"
import { useCmsType, useCreateCmsEntry } from "#/hooks/use-cms"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"
import type { CreateCmsEntryInput } from "#/lib/types/cms"

export const Route = createFileRoute("/_dashboard/cms/$typeAlias/create")({
  component: CmsEntryCreatePage,
})

function CmsEntryCreatePage() {
  const { typeAlias } = Route.useParams()
  const navigate = useNavigate()
  const { data: type, isPending, error } = useCmsType(typeAlias)
  const mutation = useCreateCmsEntry(typeAlias)

  return (
    <main className="flex-1 p-6">
      <div className="mx-auto max-w-4xl rounded-xl border bg-card p-6 shadow-sm">
        {isPending ? (
          <div className="text-sm text-muted-foreground">
            {m.common_loading()}
          </div>
        ) : error || !type ? (
          <div className="text-sm text-destructive">
            {error?.message ?? m.cms_type_failed_load()}
          </div>
        ) : (
          <EntryForm
            type={type}
            isPending={mutation.isPending}
            submitLabel={m.cms_submit_create_entry()}
            onSubmit={async (values) => {
              try {
                const row = await mutation.mutateAsync(
                  values as CreateCmsEntryInput,
                )
                toast.success(m.cms_entry_created())
                navigate({
                  to: "/cms/$typeAlias/$entryAlias",
                  params: { typeAlias, entryAlias: row.alias },
                })
              } catch (err) {
                if (err instanceof ApiError) toast.error(err.body.error)
                else toast.error(m.cms_entry_failed_create())
              }
            }}
          />
        )}
      </div>
    </main>
  )
}
