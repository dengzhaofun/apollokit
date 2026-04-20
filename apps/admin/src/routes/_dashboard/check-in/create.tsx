import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"

import * as m from "#/paraglide/messages.js"
import { ConfigForm } from "#/components/check-in/ConfigForm"
import { useCreateCheckInConfig } from "#/hooks/use-check-in"
import { ApiError } from "#/lib/api-client"

export const Route = createFileRoute("/_dashboard/check-in/create")({
  component: CheckInCreatePage,
})

function CheckInCreatePage() {
  const navigate = useNavigate()
  const createMutation = useCreateCheckInConfig()

  return (
    <>
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-2xl rounded-xl border bg-card p-6 shadow-sm">
          <ConfigForm
            submitLabel={m.common_create()}
            isPending={createMutation.isPending}
            onSubmit={async (values) => {
              try {
                await createMutation.mutateAsync(values)
                toast.success(m.checkin_config_created())
                navigate({ to: "/check-in" })
              } catch (err) {
                if (err instanceof ApiError) {
                  toast.error(err.body.error)
                } else {
                  toast.error(m.checkin_failed_create_config())
                }
              }
            }}
          />
        </div>
      </main>
    </>
  )
}
