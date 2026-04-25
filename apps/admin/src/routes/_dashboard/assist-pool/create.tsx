import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"

import { AssistPoolConfigForm } from "#/components/assist-pool/ConfigForm"
import { Button } from "#/components/ui/button"
import { useCreateAssistPoolConfig } from "#/hooks/use-assist-pool"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/assist-pool/create")({
  component: AssistPoolCreatePage,
})

function AssistPoolCreatePage() {
  const navigate = useNavigate()
  const createMutation = useCreateAssistPoolConfig()

  return (
    <main className="flex-1 p-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => navigate({ to: "/assist-pool" })}
        >
          {m.assistpool_cancel()}
        </Button>
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <AssistPoolConfigForm
            isPending={createMutation.isPending}
            submitLabel={m.assistpool_create()}
            onSubmit={async (input) => {
              try {
                await createMutation.mutateAsync(input)
                toast.success(m.assistpool_created())
                navigate({ to: "/assist-pool" })
              } catch (err) {
                if (err instanceof ApiError) toast.error(err.body.error)
                else toast.error(m.assistpool_failed_create())
              }
            }}
          />
        </div>
      </div>
    </main>
  )
}
