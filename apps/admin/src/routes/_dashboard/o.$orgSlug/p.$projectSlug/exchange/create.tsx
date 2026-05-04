import { useTenantParams } from "#/hooks/use-tenant-params";
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"

import * as m from "#/paraglide/messages.js"
import { ExchangeConfigForm } from "#/components/exchange/ConfigForm"
import { useCreateExchangeConfig } from "#/hooks/use-exchange"
import { ApiError } from "#/lib/api-client"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/exchange/create")({
  component: ExchangeCreatePage,
})

function ExchangeCreatePage() {
  const navigate = useNavigate()
    const { orgSlug, projectSlug } = useTenantParams()
  const createMutation = useCreateExchangeConfig()

  return (
    <>
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-2xl rounded-xl border bg-card p-6 shadow-sm">
          <ExchangeConfigForm
            submitLabel={m.common_create()}
            isPending={createMutation.isPending}
            onSubmit={async (values) => {
              try {
                await createMutation.mutateAsync(values)
                toast.success(m.exchange_config_created())
                navigate({ to: "/o/$orgSlug/p/$projectSlug/exchange" , params: { orgSlug, projectSlug }})
              } catch (err) {
                if (err instanceof ApiError) {
                  toast.error(err.body.error)
                } else {
                  toast.error(m.exchange_failed_create_config())
                }
              }
            }}
          />
        </div>
      </main>
    </>
  )
}
