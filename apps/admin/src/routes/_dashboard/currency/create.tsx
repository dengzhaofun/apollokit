import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import * as m from "#/paraglide/messages.js"

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
