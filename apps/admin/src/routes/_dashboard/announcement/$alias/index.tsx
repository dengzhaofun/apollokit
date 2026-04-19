import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ChevronLeft, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { AnnouncementForm } from "#/components/announcement/AnnouncementForm"
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
import { Separator } from "#/components/ui/separator"
import { SidebarTrigger } from "#/components/ui/sidebar"
import {
  useAnnouncement,
  useDeleteAnnouncement,
  useUpdateAnnouncement,
} from "#/hooks/use-announcement"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/announcement/$alias/")({
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
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-2 h-4" />
        <Button asChild variant="ghost" size="sm">
          <Link to="/announcement">
            <ChevronLeft className="size-4" />
            {m.announcement_back_to_list()}
          </Link>
        </Button>
        <h1 className="text-sm font-semibold">
          {m.announcement_title()} / <code className="text-xs">{alias}</code>
        </h1>
        <div className="ml-auto">
          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="destructive">
                <Trash2 className="size-4" />
                {m.announcement_delete_button()}
              </Button>
            </AlertDialogTrigger>
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
      </header>

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
            <AnnouncementForm
              initial={data}
              aliasLocked
              isPending={updateMutation.isPending}
              submitLabel={m.announcement_submit_save()}
              onSubmit={async (values) => {
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
