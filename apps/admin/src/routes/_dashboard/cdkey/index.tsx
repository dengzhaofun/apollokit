import { useState } from "react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { format } from "date-fns"
import { Plus } from "lucide-react"
import { toast } from "sonner"

import * as m from "#/paraglide/messages.js"
import { CdkeyBatchForm } from "#/components/cdkey/BatchForm"
import { PageHeaderActions } from "#/components/PageHeader"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import { FormDrawer } from "#/components/ui/form-drawer"
import { WriteGate } from "#/components/WriteGate"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import { useCdkeyBatches, useCreateCdkeyBatch } from "#/hooks/use-cdkey"
import { ApiError } from "#/lib/api-client"
import {
  closedModal,
  modalSearchSchema,
  openCreateModal,
} from "#/lib/modal-search"

const FORM_ID = "cdkey-batch-form"

export const Route = createFileRoute("/_dashboard/cdkey/")({
  component: CdkeyListPage,
  validateSearch: modalSearchSchema,
})

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

  const { data: batches, isPending, error } = useCdkeyBatches()

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
        {isPending ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            {m.common_loading()}
          </div>
        ) : error ? (
          <div className="flex h-40 items-center justify-center text-destructive">
            {m.cdkey_failed_load()} {error.message}
          </div>
        ) : (
          <div className="rounded-xl border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{m.common_name()}</TableHead>
                  <TableHead>{m.common_alias()}</TableHead>
                  <TableHead>{m.cdkey_code_type()}</TableHead>
                  <TableHead>{m.cdkey_redeemed()}</TableHead>
                  <TableHead>{m.common_status()}</TableHead>
                  <TableHead>{m.common_created()}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!batches || batches.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      {m.cdkey_no_batches()}
                    </TableCell>
                  </TableRow>
                ) : (
                  batches.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell>
                        <Link
                          to="/cdkey/$batchId"
                          params={{ batchId: b.id }}
                          className="font-medium hover:underline"
                        >
                          {b.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {b.alias ? (
                          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                            {b.alias}
                          </code>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {b.codeType === "universal"
                            ? m.cdkey_code_type_universal()
                            : m.cdkey_code_type_unique()}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {b.totalRedeemed}
                        {b.totalLimit != null ? ` / ${b.totalLimit}` : ""}
                      </TableCell>
                      <TableCell>
                        <Badge variant={b.isActive ? "default" : "outline"}>
                          {b.isActive
                            ? m.common_active()
                            : m.common_inactive()}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {format(new Date(b.createdAt), "yyyy-MM-dd")}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
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

  return (
    <FormDrawer
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      isDirty={formState.isDirty && !mutation.isPending}
      title={m.cdkey_new_batch()}
      size="lg"
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
        onSubmit={async (input) => {
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
        }}
      />
    </FormDrawer>
  )
}
