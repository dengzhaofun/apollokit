import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Send, Trash2, Undo2 } from "lucide-react"
import { toast } from "sonner"

import { EntryForm } from "#/components/cms/EntryForm"
import { PageHeaderActions } from "#/components/PageHeader"
import { Can } from "#/components/auth/Can"
import { Badge } from "#/components/ui/badge"
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
  useCmsEntry,
  useCmsType,
  useDeleteCmsEntry,
  usePublishCmsEntry,
  useUnpublishCmsEntry,
  useUpdateCmsEntry,
} from "#/hooks/use-cms"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"
import type { UpdateCmsEntryInput } from "#/lib/types/cms"

export const Route = createFileRoute(
  "/_dashboard/o/$orgSlug/p/$projectSlug/cms/$typeAlias/$entryAlias",
)({
  component: CmsEntryEditPage,
})

function CmsEntryEditPage() {
  const { typeAlias, entryAlias } = Route.useParams()
  const navigate = useNavigate()
  const { data: type, isPending: typePending } = useCmsType(typeAlias)
  const {
    data: entry,
    isPending: entryPending,
    error,
  } = useCmsEntry(typeAlias, entryAlias)
  const update = useUpdateCmsEntry(typeAlias)
  const publish = usePublishCmsEntry(typeAlias)
  const unpublish = useUnpublishCmsEntry(typeAlias)
  const del = useDeleteCmsEntry(typeAlias)

  const schemaDrift =
    !!type && !!entry && entry.schemaVersion !== type.schemaVersion

  return (
    <>
      <PageHeaderActions>
        <div className="ml-auto flex items-center gap-2">
          {entry ? (
            <Badge variant={entry.status === "published" ? "default" : "outline"}>
              {entry.status}
            </Badge>
          ) : null}
          {entry ? (
            <Can resource="cms" action="write" mode="disable">
              {entry.status === "published" ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      await unpublish.mutateAsync(entryAlias)
                      toast.success(m.cms_entry_unpublished())
                    } catch (err) {
                      if (err instanceof ApiError) toast.error(err.body.error)
                    }
                  }}
                >
                  <Undo2 className="size-4" />
                  {m.cms_entry_unpublish()}
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={async () => {
                    try {
                      await publish.mutateAsync(entryAlias)
                      toast.success(m.cms_entry_published())
                    } catch (err) {
                      if (err instanceof ApiError) toast.error(err.body.error)
                    }
                  }}
                >
                  <Send className="size-4" />
                  {m.cms_entry_publish()}
                </Button>
              )}
            </Can>
          ) : null}
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
                    {m.cms_entry_delete_confirm_title()}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {m.cms_entry_delete_confirm_desc()}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={async () => {
                      try {
                        await del.mutateAsync(entryAlias)
                        toast.success(m.cms_entry_deleted())
                        navigate({
                          to: "/cms/$typeAlias",
                          params: { typeAlias },
                        })
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

      <main className="flex-1 space-y-3 p-6">
        {schemaDrift ? (
          <p className="mx-auto max-w-4xl rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            {m.cms_entry_schema_drift({
              entryVersion: entry?.schemaVersion ?? 0,
              typeVersion: type?.schemaVersion ?? 0,
            })}
          </p>
        ) : null}

        <div className="mx-auto max-w-4xl rounded-xl border bg-card p-6 shadow-sm">
          {entryPending || typePending ? (
            <div className="text-sm text-muted-foreground">
              {m.common_loading()}
            </div>
          ) : error || !entry || !type ? (
            <div className="text-sm text-destructive">
              {error?.message ?? m.cms_entry_failed_load()}
            </div>
          ) : (
            <EntryForm
              type={type}
              initial={entry}
              aliasLocked
              isPending={update.isPending}
              submitLabel={m.common_save_changes()}
              onSubmit={async (values) => {
                try {
                  await update.mutateAsync({
                    entryKey: entryAlias,
                    ...(values as UpdateCmsEntryInput),
                  })
                  toast.success(m.cms_entry_updated())
                } catch (err) {
                  if (err instanceof ApiError) toast.error(err.body.error)
                  else toast.error(m.cms_entry_failed_update())
                }
              }}
            />
          )}
        </div>
      </main>
    </>
  )
}
