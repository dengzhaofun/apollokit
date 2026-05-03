import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ChevronLeft, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { AnnouncementForm } from "#/components/announcement/AnnouncementForm"
import { useAnnouncementForm } from "#/components/announcement/use-announcement-form"
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
import { Button } from "#/components/ui/button"
import {
  useAnnouncement,
  useDeleteAnnouncement,
  useUpdateAnnouncement,
} from "#/hooks/use-announcement"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"

import { PageHeaderActions } from "#/components/PageHeader"
export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/announcement/$alias/")({
  component: AnnouncementDetailPage,
})

function AnnouncementDetailPage() {
  const { alias } = Route.useParams()
  const navigate = useNavigate()
  const { data, isPending, error } = useAnnouncement(alias)
  const updateMutation = useUpdateAnnouncement()
  const deleteMutation = useDeleteAnnouncement()
  const [confirmOpen, setConfirmOpen] = useState(false)

  return (
    <>
      <PageHeaderActions>
        <Button
          render={
            <Link to="/announcement">
              <ChevronLeft className="size-4" />
              {m.announcement_back_to_list()}
            </Link>
          }
          variant="ghost" size="sm"
        />
        <div className="ml-auto">
          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogTrigger
              render={
                <Button size="sm" variant="destructive">
                  <Trash2 className="size-4" />
                  {m.announcement_delete_button()}
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {m.announcement_delete_confirm_title()}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {m.announcement_delete_confirm_desc()}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>
                  {m.announcement_cancel()}
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    try {
                      await deleteMutation.mutateAsync(alias)
                      toast.success(m.announcement_deleted())
                      navigate({ to: "/announcement" })
                    } catch (err) {
                      if (err instanceof ApiError) toast.error(err.body.error)
                      else toast.error(m.announcement_failed_delete())
                    }
                  }}
                >
                  {m.announcement_delete_confirm_action()}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </PageHeaderActions>

      <main className="flex-1 p-6">
        {isPending ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            {m.announcement_loading()}
          </div>
        ) : error ? (
          <div className="flex h-40 items-center justify-center text-destructive">
            {m.announcement_failed_load()} {error.message}
          </div>
        ) : data ? (
          <div className="mx-auto max-w-3xl rounded-xl border bg-card p-6 shadow-sm">
            <EditAnnouncementForm
              initial={data}
              alias={alias}
              isPending={updateMutation.isPending}
              onSave={async (values) => {
                try {
                  // alias is immutable in edit mode; strip before PATCH.
                  const { alias: _alias, ...patch } = values
                  void _alias
                  await updateMutation.mutateAsync({ alias, input: patch })
                  toast.success(m.announcement_updated())
                } catch (err) {
                  if (err instanceof ApiError) toast.error(err.body.error)
                  else toast.error(m.announcement_failed_update())
                }
              }}
            />
          </div>
        ) : null}
      </main>
    </>
  )
}

/**
 * Edit form lifted into a sub-component so `useAnnouncementForm` only
 * runs while we have data — same reason check-in's edit page splits its
 * form into `EditCheckInForm`.
 */
function EditAnnouncementForm({
  initial,
  alias,
  isPending,
  onSave,
}: {
  initial: NonNullable<ReturnType<typeof useAnnouncement>["data"]>
  alias: string
  isPending: boolean
  onSave: (values: Parameters<NonNullable<Parameters<typeof useAnnouncementForm>[0]["onSubmit"]>>[0]) => void | Promise<void>
}) {
  void alias
  const form = useAnnouncementForm({ initial, onSubmit: onSave })
  return (
    <AnnouncementForm
      form={form}
      aliasLocked
      isPending={isPending}
      submitLabel={m.announcement_submit_save()}
    />
  )
}
