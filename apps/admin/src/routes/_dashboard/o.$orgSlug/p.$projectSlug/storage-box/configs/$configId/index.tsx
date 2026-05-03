import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Link, useNavigate } from "#/components/router-helpers"
import { ArrowLeft, Pencil } from "lucide-react"
import { format } from "date-fns"
import { toast } from "sonner"

import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import { StorageBoxConfigForm } from "#/components/storage-box/StorageBoxConfigForm"
import { DeleteStorageBoxDialog } from "#/components/storage-box/DeleteStorageBoxDialog"
import {
  useDeleteStorageBoxConfig,
  useStorageBoxConfig,
  useUpdateStorageBoxConfig,
} from "#/hooks/use-storage-box"
import { useAllItemDefinitions } from "#/hooks/use-item"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute(
  "/_dashboard/o/$orgSlug/p/$projectSlug/storage-box/configs/$configId/",
)({
  component: StorageBoxConfigDetailPage,
})

function StorageBoxConfigDetailPage() {
  const { configId } = Route.useParams()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)

  const { data: config, isPending, error } = useStorageBoxConfig(configId)
  const { data: defs } = useAllItemDefinitions()
  const updateMutation = useUpdateStorageBoxConfig()
  const deleteMutation = useDeleteStorageBoxConfig()

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
          {error?.message ?? m.storage_box_detail_not_found()}
        </main>
      </>
    )
  }

  const defById = new Map((defs ?? []).map((d) => [d.id, d]))

  return (
    <>
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          <div className="flex items-center gap-2">
            <Button
              render={
                <Link to="/storage-box">
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
              <DeleteStorageBoxDialog
                name={config.name}
                isPending={deleteMutation.isPending}
                onConfirm={async () => {
                  try {
                    await deleteMutation.mutateAsync(config.id)
                    toast.success(m.storage_box_toast_delete_success())
                    navigate({ to: "/o/$orgSlug/p/$projectSlug/storage-box" })
                  } catch (err) {
                    toast.error(
                      err instanceof ApiError
                        ? err.body.error
                        : m.storage_box_toast_delete_failed(),
                    )
                  }
                }}
              />
            </div>
          </div>

          {editing ? (
            <div className="rounded-xl border bg-card p-6 shadow-sm">
              <StorageBoxConfigForm
                defaultValues={{
                  name: config.name,
                  alias: config.alias,
                  description: config.description,
                  icon: config.icon,
                  type: config.type as "demand" | "fixed",
                  lockupDays: config.lockupDays,
                  interestRateBps: config.interestRateBps,
                  interestPeriodDays: config.interestPeriodDays,
                  acceptedCurrencyIds: config.acceptedCurrencyIds,
                  minDeposit: config.minDeposit,
                  maxDeposit: config.maxDeposit,
                  allowEarlyWithdraw: config.allowEarlyWithdraw,
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
                    toast.success(m.storage_box_toast_save_success())
                    setEditing(false)
                  } catch (err) {
                    toast.error(
                      err instanceof ApiError
                        ? err.body.error
                        : m.storage_box_toast_save_failed(),
                    )
                  }
                }}
              />
            </div>
          ) : (
            <div className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
              <div className="grid gap-4 sm:grid-cols-2">
                <Detail label={m.common_name()} value={config.name} />
                <Detail
                  label={m.common_alias()}
                  value={
                    config.alias ? (
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        {config.alias}
                      </code>
                    ) : (
                      m.common_dash()
                    )
                  }
                />
                <Detail
                  label={m.common_type()}
                  value={
                    config.type === "fixed" ? (
                      <Badge variant="default">{m.storage_box_type_fixed()}</Badge>
                    ) : (
                      <Badge variant="secondary">{m.storage_box_type_demand()}</Badge>
                    )
                  }
                />
                <Detail
                  label={m.storage_box_field_lock_days()}
                  value={config.lockupDays ?? m.common_dash()}
                />
                <Detail
                  label={m.storage_box_field_interest_rate()}
                  value={`${(config.interestRateBps / 100).toFixed(2)}% / ${config.interestPeriodDays} d`}
                />
                <Detail
                  label={m.storage_box_field_early_withdraw()}
                  value={
                    config.allowEarlyWithdraw
                      ? m.storage_box_detail_early_allowed()
                      : m.storage_box_detail_early_disallowed()
                  }
                />
                <Detail
                  label={m.storage_box_field_min_amount_short()}
                  value={config.minDeposit ?? m.common_dash()}
                />
                <Detail
                  label={m.storage_box_field_max_amount_short()}
                  value={config.maxDeposit ?? m.common_dash()}
                />
                <Detail
                  label={m.common_status()}
                  value={
                    <Badge variant={config.isActive ? "default" : "outline"}>
                      {config.isActive ? m.common_active() : m.common_inactive()}
                    </Badge>
                  }
                />
                <Detail
                  label={m.common_created()}
                  value={format(new Date(config.createdAt), "yyyy-MM-dd HH:mm")}
                />
                {config.description && (
                  <div className="sm:col-span-2">
                    <Detail label={m.common_description()} value={config.description} />
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  {m.storage_box_field_currencies()}
                </p>
                <div className="flex flex-wrap gap-2">
                  {config.acceptedCurrencyIds.length === 0 ? (
                    <span className="text-sm text-muted-foreground">—</span>
                  ) : (
                    config.acceptedCurrencyIds.map((id) => {
                      const def = defById.get(id)
                      return (
                        <Badge key={id} variant="outline">
                          {def?.name ?? id.slice(0, 8)}
                        </Badge>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  )
}

function Detail({
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
