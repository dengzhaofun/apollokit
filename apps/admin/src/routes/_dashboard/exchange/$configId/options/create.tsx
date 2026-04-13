import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"

import { SidebarTrigger } from "#/components/ui/sidebar"
import { Separator } from "#/components/ui/separator"
import { OptionForm } from "#/components/exchange/OptionForm"
import { useCreateExchangeOption } from "#/hooks/use-exchange"
import { ApiError } from "#/lib/api-client"

export const Route = createFileRoute(
  "/_dashboard/exchange/$configId/options/create",
)({
  component: CreateOptionPage,
})

function CreateOptionPage() {
  const { configId } = Route.useParams()
  const navigate = useNavigate()
  const createMutation = useCreateExchangeOption()

  return (
    <>
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-2 h-4" />
        <h1 className="text-sm font-semibold">New Exchange Option</h1>
      </header>

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-2xl rounded-xl border bg-card p-6 shadow-sm">
          <OptionForm
            submitLabel="Create"
            isPending={createMutation.isPending}
            onSubmit={async (values) => {
              try {
                await createMutation.mutateAsync({
                  configKey: configId,
                  ...values,
                })
                toast.success("Exchange option created successfully")
                navigate({
                  to: "/exchange/$configId",
                  params: { configId },
                })
              } catch (err) {
                if (err instanceof ApiError) {
                  toast.error(err.body.error)
                } else {
                  toast.error("Failed to create option")
                }
              }
            }}
          />
        </div>
      </main>
    </>
  )
}
