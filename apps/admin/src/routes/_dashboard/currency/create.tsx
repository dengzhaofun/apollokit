import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import * as m from "#/paraglide/messages.js"

import { SidebarTrigger } from "#/components/ui/sidebar"
import { Separator } from "#/components/ui/separator"
import { DefinitionForm } from "#/components/currency/DefinitionForm"
import { useCreateCurrency } from "#/hooks/use-currency"
import { ApiError } from "#/lib/api-client"

export const Route = createFileRoute("/_dashboard/currency/create")({
  component: CreateCurrencyPage,
})

function CreateCurrencyPage() {
  const navigate = useNavigate()
  const createMutation = useCreateCurrency()

  return (
    <>
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-2 h-4" />
        <h1 className="text-sm font-semibold">
          {m.currency_new_definition()}
        </h1>
      </header>

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-2xl rounded-xl border bg-card p-6 shadow-sm">
          <DefinitionForm
            submitLabel={m.common_create()}
            isPending={createMutation.isPending}
            onSubmit={async (values) => {
              try {
                await createMutation.mutateAsync(values)
                toast.success(m.currency_created())
                navigate({ to: "/currency" })
              } catch (err) {
                if (err instanceof ApiError) {
                  toast.error(err.body.error)
                } else {
                  toast.error(m.currency_failed_create())
                }
              }
            }}
          />
        </div>
      </main>
    </>
  )
}
