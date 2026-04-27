import { useMemo, useState } from "react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"
import { Plus } from "lucide-react"
import { toast } from "sonner"

import * as m from "#/paraglide/messages.js"
import { CdkeyBatchForm } from "#/components/cdkey/BatchForm"
import { useBatchForm } from "#/components/cdkey/use-batch-form"
import { DataTable } from "#/components/data-table/DataTable"
import { PageHeaderActions } from "#/components/PageHeader"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import { FormDrawerWithAssist } from "#/components/ui/form-drawer-with-assist"
import { WriteGate } from "#/components/WriteGate"
import {
  CDKEY_BATCH_FILTER_DEFS,
  useCdkeyBatches,
  useCreateCdkeyBatch,
} from "#/hooks/use-cdkey"
import { ApiError } from "#/lib/api-client"
import { listSearchSchema } from "#/lib/list-search"
import {
  closedModal,
  modalSearchSchema,
  openCreateModal,
} from "#/lib/modal-search"
import type { CdkeyBatch } from "#/lib/types/cdkey"

const FORM_ID = "cdkey-batch-form"

export const Route = createFileRoute("/_dashboard/cdkey/")({
  component: CdkeyListPage,
  validateSearch: modalSearchSchema.merge(listSearchSchema).passthrough(),
})

const columnHelper = createColumnHelper<CdkeyBatch>()

function useColumns(): ColumnDef<CdkeyBatch, unknown>[] {
  return useMemo(
    () => [
      columnHelper.accessor("name", {
        header: () => m.common_name(),
        cell: (info) => (
          <Link
            to="/cdkey/$batchId"
            params={{ batchId: info.row.original.id }}
            className="font-medium hover:underline"
          >
            {info.getValue()}
          </Link>
        ),
      }),
      columnHelper.accessor("alias", {
        header: () => m.common_alias(),
        cell: (info) => {
          const alias = info.getValue()
          return alias ? (
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{alias}</code>
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        },
      }),
      columnHelper.accessor("codeType", {
        header: () => m.cdkey_code_type(),
        cell: (info) => (
          <Badge variant="outline">
            {info.getValue() === "universal"
              ? m.cdkey_code_type_universal()
              : m.cdkey_code_type_unique()}
          </Badge>
        ),
      }),
      columnHelper.accessor("totalRedeemed", {
        header: () => m.cdkey_redeemed(),
        cell: (info) => {
          const b = info.row.original
          return (
            <>
              {info.getValue()}
              {b.totalLimit != null ? ` / ${b.totalLimit}` : ""}
            </>
          )
        },
      }),
      columnHelper.accessor("isActive", {
        header: () => m.common_status(),
        cell: (info) => (
          <Badge variant={info.getValue() ? "default" : "outline"}>
            {info.getValue() ? m.common_active() : m.common_inactive()}
          </Badge>
        ),
      }),
      columnHelper.accessor("createdAt", {
        header: () => m.common_created(),
        cell: (info) => format(new Date(info.getValue()), "yyyy-MM-dd"),
      }),
    ],
    [],
  ) as ColumnDef<CdkeyBatch, unknown>[]
}

function CdkeyListPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const modal = search.modal

  function closeModal() {
    void navigate({ search: (prev) => ({ ...prev, ...closedModal }) })
  }
  function openCreate() {
    void navigate({ search: (prev) => ({ ...prev, ...openCreateModal }) })
  }

  const list = useCdkeyBatches(Route)
  const columns = useColumns()

  return (
    <>
      <PageHeaderActions>
        <div className="ml-auto">
          <WriteGate>
            <Button size="sm" onClick={openCreate}>
              <Plus className="size-4" />
              {m.cdkey_new_batch()}
            </Button>
          </WriteGate>
        </div>
      </PageHeaderActions>

      <main className="flex-1 p-6">
        <DataTable
          columns={columns}
          data={list.items}
          getRowId={(row) => row.id}
          filters={CDKEY_BATCH_FILTER_DEFS}
          filterValues={list.filters}
          onFilterChange={list.setFilter}
          onResetFilters={list.resetFilters}
          hasActiveFilters={list.hasActiveFilters}
          activeFilterCount={list.activeFilterCount}
          mode={list.mode}
          onModeChange={list.setMode}
          advancedQuery={
            list.advanced as
              | import("#/components/ui/query-builder").RuleGroupType
              | undefined
          }
          onAdvancedQueryChange={list.setAdvanced}
          {...list.tableProps}
        />
      </main>

      {modal === "create" ? <CreateBatchDrawer onClose={closeModal} /> : null}
    </>
  )
}

function CreateBatchDrawer({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const mutation = useCreateCdkeyBatch()
  const [formState, setFormState] = useState({
    canSubmit: false,
    isDirty: false,
    isSubmitting: false,
  })
  const form = useBatchForm({
    onSubmit: async (input) => {
      try {
        const created = await mutation.mutateAsync(input)
        toast.success(m.cdkey_batch_created())
        onClose()
        void navigate({
          to: "/cdkey/$batchId",
          params: { batchId: created.id },
        })
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.body.error : m.cdkey_failed_create(),
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
      isDirty={formState.isDirty && !mutation.isPending}
      title={m.cdkey_new_batch()}
      form={form}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {m.common_cancel()}
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            disabled={!formState.canSubmit || mutation.isPending}
          >
            {mutation.isPending ? m.common_saving() : m.common_create()}
          </Button>
        </>
      }
    >
      <CdkeyBatchForm
        id={FORM_ID}
        hideSubmitButton
        onStateChange={setFormState}
        isPending={mutation.isPending}
        submitLabel={m.common_create()}
        form={form}
      />
    </FormDrawerWithAssist>
  )
}
