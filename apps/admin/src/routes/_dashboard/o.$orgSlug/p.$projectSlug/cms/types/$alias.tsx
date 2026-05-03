import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"

import { TypeForm } from "#/components/cms/TypeForm"
import { PageHeaderActions } from "#/components/PageHeader"
import { Can } from "#/components/auth/Can"
import { Button } from "#/components/ui/button"
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
import {
  useCmsType,
  useDeleteCmsType,
  useUpdateCmsType,
} from "#/hooks/use-cms"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/cms/types/$alias")({
  component: CmsTypeEditPage,
})

function CmsTypeEditPage() {
  const { alias } = Route.useParams()
  const navigate = useNavigate()
  const { data: type, isPending, error } = useCmsType(alias)
  const update = useUpdateCmsType()
  const del = useDeleteCmsType()

  return (
    <>
      <PageHeaderActions>
        <div className="ml-auto">
          <Can resource="cms" action="write" mode="disable">
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button variant="outline" size="sm">
                    <Trash2 className="size-4 text-destructive" />
                    {m.common_delete()}
                  </Button>
                }
              />
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {m.cms_type_delete_confirm_title()}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {m.cms_type_delete_confirm_desc()}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={async () => {
                      try {
                        await del.mutateAsync(alias)
                        toast.success(m.cms_type_deleted())
                        navigate({ to: "/cms" })
                      } catch (err) {
                        if (err instanceof ApiError)
                          toast.error(err.body.error)
                      }
                    }}
                  >
                    {m.common_delete()}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </Can>
        </div>
      </PageHeaderActions>

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
            <TypeForm
              initial={type}
              aliasLocked
              isPending={update.isPending}
              submitLabel={m.common_save_changes()}
              onSubmit={async (values) => {
                try {
                  await update.mutateAsync({
                    typeKey: alias,
                    name: values.name,
                    description: values.description,
                    icon: values.icon,
                    schema: values.schema,
                    groupOptions: values.groupOptions,
                    status: values.status,
                  })
                  toast.success(m.cms_type_updated())
                } catch (err) {
                  if (err instanceof ApiError) toast.error(err.body.error)
                  else toast.error(m.cms_type_failed_update())
                }
              }}
            />
          )}
        </div>
      </main>
    </>
  )
}
