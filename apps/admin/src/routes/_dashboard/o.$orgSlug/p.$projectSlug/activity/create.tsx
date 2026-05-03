import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"

import { ActivityForm } from "#/components/activity/ActivityForm"
import { useCreateActivity } from "#/hooks/use-activity"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/activity/create")({
  component: ActivityCreatePage,
})

function ActivityCreatePage() {
  const navigate = useNavigate()
  const mutation = useCreateActivity()

  return (
    <>
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-3xl rounded-xl border bg-card p-6 shadow-sm">
          <ActivityForm
            isPending={mutation.isPending}
            onSubmit={async (values) => {
              try {
                await mutation.mutateAsync(values)
                toast.success(m.activity_create_success())
                navigate({ to: "/activity" })
              } catch (err) {
                if (err instanceof ApiError) toast.error(err.body.error)
                else toast.error(m.activity_create_failed())
              }
            }}
          />
        </div>
      </main>
    </>
  )
}
