import { useMemo, useState } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { toast } from "sonner"
import * as m from "#/paraglide/messages.js"

import { Button } from "#/components/ui/button"
import { FormDrawerWithAssist } from "#/components/ui/form-drawer-with-assist"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs"
import { DefinitionForm } from "#/components/currency/DefinitionForm"
import { useDefinitionForm } from "#/components/currency/use-definition-form"
import { DefinitionTable } from "#/components/currency/DefinitionTable"
import { LedgerTable } from "#/components/currency/LedgerTable"
import {
  useAllCurrencies,
  useCreateCurrency,
  useCurrency,
  useCurrencyLedger,
  useUpdateCurrency,
} from "#/hooks/use-currency"
import { ApiError } from "#/lib/api-client"
import {
  closedModal,
  modalSearchSchema,
  openCreateModal,
} from "#/lib/modal-search"
import { listSearchSchema } from "#/lib/list-search"

const FORM_ID = "currency-definition-form"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/currency/")({
  component: CurrencyListPage,
  validateSearch: modalSearchSchema.merge(listSearchSchema).passthrough(),
})

function CurrencyListPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const modal = search.modal
  const editingId = modal === "edit" ? search.id : undefined

  function closeModal() {
    void navigate({ search: (prev) => ({ ...prev, ...closedModal }) })
  }
  function openCreate() {
    void navigate({ search: (prev) => ({ ...prev, ...openCreateModal }) })
  }

  // Selector dropdown for the ledger filter — needs all currencies at once.
  const { data: allCurrencies } = useAllCurrencies()

  const [ledgerUser, setLedgerUser] = useState("")
  const [ledgerCurrency, setLedgerCurrency] = useState("")
  const {
    data: ledger,
    isPending: ledgerPending,
    error: ledgerError,
  } = useCurrencyLedger({
    endUserId: ledgerUser || undefined,
    currencyId: ledgerCurrency || undefined,
    limit: 100,
  })

  const currencyNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of allCurrencies ?? []) map.set(c.id, c.name)
    return map
  }, [allCurrencies])

  return (
    <>
      <main className="flex-1 p-6">
        <Tabs defaultValue="definitions">
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="definitions">
                {m.currency_definitions()}
              </TabsTrigger>
              <TabsTrigger value="ledger">{m.currency_ledger()}</TabsTrigger>
            </TabsList>
            <div className="flex gap-2">
              <Button size="sm" onClick={openCreate}>
                <Plus className="size-4" />
                {m.currency_new_definition()}
              </Button>
            </div>
          </div>

          <TabsContent value="definitions" className="mt-6">
            <DefinitionTable route={Route} />
          </TabsContent>

          <TabsContent value="ledger" className="mt-6 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ledger-user">{m.currency_end_user_id()}</Label>
                <Input
                  id="ledger-user"
                  value={ledgerUser}
                  onChange={(e) => setLedgerUser(e.target.value)}
                  placeholder="user-42"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ledger-currency">
                  {m.currency_currency()}
                </Label>
                <select
                  id="ledger-currency"
                  value={ledgerCurrency}
                  onChange={(e) => setLedgerCurrency(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  <option value="">{m.currency_filter_all()}</option>
                  {(allCurrencies ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="rounded-xl border bg-card shadow-sm">
              {ledgerPending ? (
                <div className="p-6 text-sm text-muted-foreground">
                  {m.common_loading()}
                </div>
              ) : ledgerError ? (
                <div className="p-6 text-sm text-destructive">
                  {ledgerError.message}
                </div>
              ) : (
                <LedgerTable
                  data={ledger?.items ?? []}
                  resolveCurrencyName={(id) => currencyNameById.get(id) ?? id}
                />
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {modal === "create" ? (
        <CreateCurrencyDialog onClose={closeModal} />
      ) : null}
      {modal === "edit" && editingId ? (
        <EditCurrencyDialog id={editingId} onClose={closeModal} />
      ) : null}
    </>
  )
}

interface DialogShellProps {
  onClose: () => void
}

function CreateCurrencyDialog({ onClose }: DialogShellProps) {
  const createMutation = useCreateCurrency()
  const [formState, setFormState] = useState({
    canSubmit: false,
    isDirty: false,
    isSubmitting: false,
  })
  const form = useDefinitionForm({
    onSubmit: async (values) => {
      try {
        await createMutation.mutateAsync(values)
        toast.success(m.currency_created())
        onClose()
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.body.error : m.currency_failed_create(),
        )
      }
    },
  })

  return (
    <FormDrawerWithAssist
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      isDirty={formState.isDirty && !createMutation.isPending}
      title={m.currency_new_definition()}
      form={form}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {m.common_cancel()}
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            disabled={!formState.canSubmit || createMutation.isPending}
          >
            {createMutation.isPending ? m.common_saving() : m.common_create()}
          </Button>
        </>
      }
    >
      <DefinitionForm
        id={FORM_ID}
        hideSubmitButton
        onStateChange={setFormState}
        isPending={createMutation.isPending}
        form={form}
      />
    </FormDrawerWithAssist>
  )
}

function EditCurrencyDialog({
  id,
  onClose,
}: DialogShellProps & { id: string }) {
  const { data: currency, isPending: loading, error } = useCurrency(id)
  if (loading) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        {m.common_loading()}
      </div>
    )
  }
  if (error || !currency) {
    return (
      <div className="py-10 text-center text-sm text-destructive">
        {error?.message ?? "Currency not found"}
      </div>
    )
  }
  return <EditCurrencyDialogLoaded currency={currency} onClose={onClose} />
}

function EditCurrencyDialogLoaded({
  currency,
  onClose,
}: DialogShellProps & {
  currency: NonNullable<ReturnType<typeof useCurrency>["data"]>
}) {
  const updateMutation = useUpdateCurrency()
  const [formState, setFormState] = useState({
    canSubmit: false,
    isDirty: false,
    isSubmitting: false,
  })
  const form = useDefinitionForm({
    defaultValues: {
      name: currency.name,
      alias: currency.alias,
      description: currency.description,
      icon: currency.icon,
      isActive: currency.isActive,
      activityId: currency.activityId,
    },
    onSubmit: async (values) => {
      try {
        await updateMutation.mutateAsync({ id: currency.id, ...values })
        toast.success(m.currency_updated())
        onClose()
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.body.error : "Failed to update",
        )
      }
    },
  })

  return (
    <FormDrawerWithAssist
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      isDirty={formState.isDirty && !updateMutation.isPending}
      title={m.common_edit()}
      form={form}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {m.common_cancel()}
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            disabled={!formState.canSubmit || updateMutation.isPending}
          >
            {updateMutation.isPending
              ? m.common_saving()
              : m.common_save_changes()}
          </Button>
        </>
      }
    >
      <DefinitionForm
        id={FORM_ID}
        hideSubmitButton
        onStateChange={setFormState}
        isPending={updateMutation.isPending}
        form={form}
      />
    </FormDrawerWithAssist>
  )
}
