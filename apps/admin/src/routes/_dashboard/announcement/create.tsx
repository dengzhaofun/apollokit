import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"

import { AnnouncementForm } from "#/components/announcement/AnnouncementForm"
import { useCreateAnnouncement } from "#/hooks/use-announcement"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/announcement/create")({
  component: AnnouncementCreatePage,
})

function AnnouncementCreatePage() {
  const navigate = useNavigate()
  const mutation = useCreateAnnouncement()

  return (
    <>
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-3xl rounded-xl border bg-card p-6 shadow-sm">
          <AnnouncementForm
            isPending={mutation.isPending}
            submitLabel={m.announcement_submit_create()}
            onSubmit={async (values) => {
              try {
                const row = await mutation.mutateAsync(values)
                toast.success(m.announcement_created())
                navigate({
                  to: "/announcement/$alias",
                  params: { alias: row.alias },
                })
              } catch (err) {
                if (err instanceof ApiError) toast.error(err.body.error)
                else toast.error(m.announcement_failed_create())
              }
            }}
          />
        </div>
      </main>
    </>
  )
}
