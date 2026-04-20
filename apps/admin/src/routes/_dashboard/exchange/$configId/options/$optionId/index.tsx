import { useState } from "react"
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router"
import { format } from "date-fns"
import { Pencil, ArrowLeft } from "lucide-react"
import { toast } from "sonner"

import * as m from "#/paraglide/messages.js"
import { Button } from "#/components/ui/button"
import { Badge } from "#/components/ui/badge"
import { OptionForm } from "#/components/exchange/OptionForm"
import { ExchangeDeleteDialog } from "#/components/exchange/DeleteDialog"
import { ExecutePanel } from "#/components/exchange/ExecutePanel"
import { ItemRewardRow } from "#/components/item/ItemRewardRow"
import type { RewardEntry } from "#/lib/types/rewards"
import {
  useExchangeOptions,
  useUpdateExchangeOption,
  useDeleteExchangeOption,
} from "#/hooks/use-exchange"
import { ApiError } from "#/lib/api-client"

export const Route = createFileRoute(
  "/_dashboard/exchange/$configId/options/$optionId/",
)({
  component: OptionDetailPage,
})

function OptionDetailPage() {
  const { configId, optionId } = Route.useParams()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)

  const { data: options, isPending, error } = useExchangeOptions(configId)
  const option = options?.find((o) => o.id === optionId)
  const updateMutation = useUpdateExchangeOption()
  const deleteMutation = useDeleteExchangeOption()

  if (isPending) {
    return (
      <>
        <main className="flex h-40 items-center justify-center text-muted-foreground">
          {m.common_loading()}
        </main>
      </>
    )
  }

  if (error || !option) {
    return (
      <>
        <main className="flex h-40 items-center justify-center text-destructive">
          {error?.message ?? "Option not found"}
        </main>
      </>
    )
  }

  return (
    <>
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/exchange/$configId" params={{ configId }}>
                <ArrowLeft className="size-4" />
                {m.common_back()}
              </Link>
            </Button>
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
                name={option.name}
                description="This will permanently delete this exchange option. This action cannot be undone."
                isPending={deleteMutation.isPending}
                onConfirm={async () => {
                  try {
                    await deleteMutation.mutateAsync(option.id)
                    toast.success(m.exchange_option_deleted())
                    navigate({
                      to: "/exchange/$configId",
                      params: { configId },
                    })
                  } catch (err) {
                    toast.error(
                      err instanceof ApiError
                        ? err.body.error
                        : m.exchange_failed_delete_option(),
                    )
                  }
                }}
              />
            </div>
          </div>

          {editing ? (
            <div className="rounded-xl border bg-card p-6 shadow-sm">
              <OptionForm
                defaultValues={{
                  name: option.name,
                  description: option.description,
                  costItems: option.costItems,
                  rewardItems: option.rewardItems,
                  userLimit: option.userLimit,
                  globalLimit: option.globalLimit,
                  sortOrder: option.sortOrder,
                  isActive: option.isActive,
                }}
                submitLabel={m.common_save_changes()}
                isPending={updateMutation.isPending}
                onSubmit={async (values) => {
                  try {
                    await updateMutation.mutateAsync({
                      optionId: option.id,
                      ...values,
                    })
                    toast.success("Option updated")
                    setEditing(false)
                  } catch (err) {
                    toast.error(
                      err instanceof ApiError
                        ? err.body.error
                        : m.exchange_failed_update_option(),
                    )
                  }
                }}
              />
            </div>
          ) : (
            <div className="rounded-xl border bg-card p-6 shadow-sm">
              <div className="grid gap-4 sm:grid-cols-2">
                <DetailItem label={m.common_name()} value={option.name} />
                <DetailItem
                  label={m.common_status()}
                  value={
                    <Badge variant={option.isActive ? "default" : "outline"}>
                      {option.isActive ? m.common_active() : m.common_inactive()}
                    </Badge>
                  }
                />
                <DetailItem
                  label={m.exchange_cost_items()}
                  value={
                    <ItemList items={option.costItems} />
                  }
                />
                <DetailItem
                  label={m.exchange_reward_items()}
                  value={
                    <ItemList items={option.rewardItems} />
                  }
                />
                <DetailItem
                  label={m.exchange_user_limit()}
                  value={option.userLimit ?? m.common_unlimited()}
                />
                <DetailItem
                  label={m.exchange_global_limit()}
                  value={
                    option.globalLimit != null
                      ? `${option.globalCount} / ${option.globalLimit}`
                      : `${option.globalCount} (unlimited)`
                  }
                />
                <DetailItem label={m.common_sort_order()} value={option.sortOrder} />
                <DetailItem
                  label={m.common_created()}
                  value={format(new Date(option.createdAt), "yyyy-MM-dd HH:mm")}
                />
                {option.description && (
                  <div className="sm:col-span-2">
                    <DetailItem label={m.common_description()} value={option.description} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Execute Test */}
          {!editing && (
            <div className="rounded-xl border bg-card p-6 shadow-sm">
              <h3 className="mb-4 text-sm font-semibold">{m.exchange_execute_test()}</h3>
              <ExecutePanel optionId={optionId} />
            </div>
          )}
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

function ItemList({ items }: { items: RewardEntry[] }) {
  return (
    <ul className="space-y-1">
      {items.map((item, i) => (
        <li key={i}>
          <ItemRewardRow size="sm" entry={item} />
        </li>
      ))}
    </ul>
  )
}
