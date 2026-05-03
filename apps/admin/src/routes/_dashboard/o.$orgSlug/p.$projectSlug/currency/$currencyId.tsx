import { useState } from "react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, Pencil, Trash2 } from "lucide-react"
import { format } from "date-fns"
import { toast } from "sonner"
import * as m from "#/paraglide/messages.js"

import { Button } from "#/components/ui/button"
import { Badge } from "#/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "#/components/ui/alert-dialog"
import { DefinitionForm } from "#/components/currency/DefinitionForm"
import { useDefinitionForm } from "#/components/currency/use-definition-form"
import {
  useCurrency,
  useDeleteCurrency,
  useUpdateCurrency,
} from "#/hooks/use-currency"
import { ApiError } from "#/lib/api-client"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/currency/$currencyId")({
  component: CurrencyDetailPage,
})

function CurrencyDetailPage() {
  const { currencyId } = Route.useParams()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const { data: currency, isPending, error } = useCurrency(currencyId)
  const updateMutation = useUpdateCurrency()
  const deleteMutation = useDeleteCurrency()

  if (isPending) {
    return (
      <>
        <main className="flex h-40 items-center justify-center text-muted-foreground">
          {m.common_loading()}
        </main>
      </>
    )
  }

  if (error || !currency) {
    return (
      <>
        <main className="flex h-40 items-center justify-center text-destructive">
          {error?.message ?? "Currency not found"}
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
                <Link to="/currency">
                  <ArrowLeft className="size-4" />
                  {m.common_back()}
                </Link>
              }
              variant="outline" size="sm"
            />
            <div className="ml-auto flex items-center gap-2">
              {!editing && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing(true)}
                >
                  <Pencil className="size-4" />
                  {m.common_edit()}
                </Button>
              )}
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="size-4" />
                {m.common_delete()}
              </Button>
            </div>
          </div>

          {editing ? (
            <div className="rounded-xl border bg-card p-6 shadow-sm">
              <EditCurrencyPanel
                currency={currency}
                isPending={updateMutation.isPending}
                onSave={async (values) => {
                  try {
                    await updateMutation.mutateAsync({
                      id: currency.id,
                      ...values,
                    })
                    toast.success(m.currency_updated())
                    setEditing(false)
                  } catch (err) {
                    if (err instanceof ApiError) toast.error(err.body.error)
                    else toast.error(m.currency_failed_update())
                  }
                }}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 rounded-xl border bg-card p-6 shadow-sm sm:grid-cols-2">
              <DetailItem label={m.common_name()} value={currency.name} />
              <DetailItem
                label={m.common_alias()}
                value={currency.alias ?? "—"}
              />
              <DetailItem
                label={m.common_status()}
                value={
                  <Badge variant={currency.isActive ? "default" : "outline"}>
                    {currency.isActive
                      ? m.common_active()
                      : m.common_inactive()}
                  </Badge>
                }
              />
              <DetailItem
                label={m.common_link_activity()}
                value={currency.activityId ?? m.currency_permanent()}
              />
              <DetailItem
                label={m.currency_sort_order()}
                value={currency.sortOrder}
              />
              <DetailItem label="Icon" value={currency.icon ?? "—"} />
              <DetailItem
                label={m.common_created()}
                value={format(
                  new Date(currency.createdAt),
                  "yyyy-MM-dd HH:mm",
                )}
              />
              <DetailItem
                label="Updated"
                value={format(
                  new Date(currency.updatedAt),
                  "yyyy-MM-dd HH:mm",
                )}
              />
              {currency.description && (
                <div className="sm:col-span-2">
                  <DetailItem
                    label={m.common_description()}
                    value={currency.description}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{m.currency_delete_confirm()}</AlertDialogTitle>
            <AlertDialogDescription>
              {m.currency_delete_hint()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await deleteMutation.mutateAsync(currency.id)
                  toast.success(m.currency_deleted())
                  navigate({ to: "/currency" })
                } catch (err) {
                  if (err instanceof ApiError) {
                    toast.error(err.body.error)
                  } else {
                    toast.error(m.currency_failed_delete())
                  }
                }
              }}
            >
              {m.common_delete()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

function EditCurrencyPanel({
  currency,
  isPending,
  onSave,
}: {
  currency: NonNullable<ReturnType<typeof useCurrency>["data"]>
  isPending: boolean
  onSave: (values: Parameters<NonNullable<Parameters<typeof useDefinitionForm>[0]["onSubmit"]>>[0]) => void | Promise<void>
}) {
  const form = useDefinitionForm({ defaultValues: currency, onSubmit: onSave })
  return (
    <DefinitionForm
      form={form}
      submitLabel={m.common_save()}
      isPending={isPending}
    />
  )
}
