import { useTenantParams } from "#/hooks/use-tenant-params";
import { useState } from "react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { format } from "date-fns"
import { Pencil, ArrowLeft, Plus } from "lucide-react"
import { toast } from "sonner"

import * as m from "#/paraglide/messages.js"
import { Button } from "#/components/ui/button"
import { Badge } from "#/components/ui/badge"
import { ExchangeConfigForm } from "#/components/exchange/ConfigForm"
import { ExchangeDeleteDialog } from "#/components/exchange/DeleteDialog"
import { OptionTable } from "#/components/exchange/OptionTable"
import {
  useExchangeConfig,
  useUpdateExchangeConfig,
  useDeleteExchangeConfig,
} from "#/hooks/use-exchange"
import { ApiError } from "#/lib/api-client"
import { listSearchSchema } from "#/lib/list-search"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/exchange/$configId/")({
  component: ExchangeConfigDetailPage,
  validateSearch: listSearchSchema.passthrough(),
})

function ExchangeConfigDetailPage() {
  const { configId } = Route.useParams()
  const navigate = useNavigate()
  const { orgSlug, projectSlug } = useTenantParams()
  const [editing, setEditing] = useState(false)

  const { data: config, isPending, error } = useExchangeConfig(configId)
  const updateMutation = useUpdateExchangeConfig()
  const deleteMutation = useDeleteExchangeConfig()

  if (isPending) {
    return (
      <>
        <main className="flex h-40 items-center justify-center text-muted-foreground">
          {m.common_loading()}
        </main>
      </>
    )
  }

  if (error || !config) {
    return (
      <>
        <main className="flex h-40 items-center justify-center text-destructive">
          {error?.message ?? "Config not found"}
        </main>
      </>
    )
  }

  return (
    <>
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          <div className="flex items-center gap-2">
            <Button
              render={
                <Link to="/o/$orgSlug/p/$projectSlug/exchange" params={{ orgSlug, projectSlug }}>
                  <ArrowLeft className="size-4" />
                  {m.common_back()}
                </Link>
              }
              variant="outline" size="sm"
            />
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing(!editing)}
              >
                <Pencil className="size-4" />
                {editing ? m.common_cancel() : m.common_edit()}
              </Button>
              <ExchangeDeleteDialog
                name={config.name}
                description="This will permanently delete this exchange config and all its options. This action cannot be undone."
                isPending={deleteMutation.isPending}
                onConfirm={async () => {
                  try {
                    await deleteMutation.mutateAsync(config.id)
                    toast.success(m.exchange_config_deleted())
                    navigate({ to: "/o/$orgSlug/p/$projectSlug/exchange" , params: { orgSlug, projectSlug }})
                  } catch (err) {
                    toast.error(
                      err instanceof ApiError
                        ? err.body.error
                        : "Failed to delete config",
                    )
                  }
                }}
              />
            </div>
          </div>

          {editing ? (
            <div className="rounded-xl border bg-card p-6 shadow-sm">
              <ExchangeConfigForm
                defaultValues={{
                  name: config.name,
                  alias: config.alias,
                  description: config.description,
                  isActive: config.isActive,
                }}
                submitLabel={m.common_save_changes()}
                isPending={updateMutation.isPending}
                onSubmit={async (values) => {
                  try {
                    await updateMutation.mutateAsync({
                      id: config.id,
                      ...values,
                    })
                    toast.success(m.checkin_config_updated())
                    setEditing(false)
                  } catch (err) {
                    toast.error(
                      err instanceof ApiError
                        ? err.body.error
                        : "Failed to update config",
                    )
                  }
                }}
              />
            </div>
          ) : (
            <div className="rounded-xl border bg-card p-6 shadow-sm">
              <div className="grid gap-4 sm:grid-cols-2">
                <DetailItem label={m.common_name()} value={config.name} />
                <DetailItem
                  label={m.common_alias()}
                  value={
                    config.alias ? (
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        {config.alias}
                      </code>
                    ) : (
                      "—"
                    )
                  }
                />
                <DetailItem
                  label={m.common_status()}
                  value={
                    <Badge variant={config.isActive ? "default" : "outline"}>
                      {config.isActive ? m.common_active() : m.common_inactive()}
                    </Badge>
                  }
                />
                <DetailItem
                  label={m.common_created()}
                  value={format(new Date(config.createdAt), "yyyy-MM-dd HH:mm")}
                />
                <DetailItem
                  label="Updated"
                  value={format(new Date(config.updatedAt), "yyyy-MM-dd HH:mm")}
                />
                {config.description && (
                  <div className="sm:col-span-2">
                    <DetailItem label={m.common_description()} value={config.description} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Options */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{m.exchange_options()}</h3>
              <Button
                render={
                  <Link
                    to="/o/$orgSlug/p/$projectSlug/exchange/$configId/options/create"
                    params={{ orgSlug, projectSlug, configId }}
                  >
                    <Plus className="size-4" />
                    {m.exchange_new_option()}
                  </Link>
                }
                size="sm"
              />
            </div>
            <OptionTable configKey={configId} route={Route} />
          </div>
        </div>
      </main>
    </>
  )
}

function DetailItem({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="text-sm">{value}</div>
    </div>
  )
}
