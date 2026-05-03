import { useState } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Beaker, Plus } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import { ExperimentForm, type ExperimentFormBridgeState } from "#/components/experiment/ExperimentForm"
import { ExperimentTable } from "#/components/experiment/ExperimentTable"
import { PageBody, PageHeader, PageShell } from "#/components/patterns"
import { Button } from "#/components/ui/button"
import { FormDrawer } from "#/components/ui/form-drawer"
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "#/components/ui/tabs"
import { Can } from "#/components/auth/Can"
import { useCreateExperiment } from "#/hooks/use-experiment"
import { ApiError } from "#/lib/api-client"
import { listSearchSchema } from "#/lib/list-search"
import {
  closedModal,
  modalSearchSchema,
  openCreateModal,
} from "#/lib/modal-search"
import type { ExperimentStatus } from "#/lib/types/experiment"
import * as m from "#/paraglide/messages.js"

const FORM_ID = "experiment-create-form"

const STATUS_TABS: Array<ExperimentStatus | ""> = [
  "",
  "running",
  "draft",
  "paused",
  "archived",
]

const experimentSearchSchema = modalSearchSchema
  .merge(listSearchSchema)
  .merge(
    z.object({
      status: z
        .enum(["draft", "running", "paused", "archived"])
        .optional(),
    }),
  )
  .passthrough()

export const Route = createFileRoute("/_dashboard/experiment/")({
  component: ExperimentListPage,
  validateSearch: experimentSearchSchema,
})

function statusLabel(status: ExperimentStatus | ""): string {
  if (status === "") return m.experiment_status_filter_all()
  return {
    draft: m.experiment_status_draft(),
    running: m.experiment_status_running(),
    paused: m.experiment_status_paused(),
    archived: m.experiment_status_archived(),
  }[status]
}

function ExperimentListPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const status = (search.status ?? "") as ExperimentStatus | ""
  const modal = search.modal

  function closeModal() {
    void navigate({ search: (prev) => ({ ...prev, ...closedModal }) })
  }
  function openCreate() {
    void navigate({ search: (prev) => ({ ...prev, ...openCreateModal }) })
  }
  function setStatus(next: ExperimentStatus | "") {
    void navigate({
      search: (prev) => ({
        ...prev,
        status: next === "" ? undefined : next,
        cursor: undefined,
      }),
    })
  }

  return (
    <PageShell>
      <PageHeader
        icon={<Beaker className="size-5" />}
        title={m.experiment_title()}
        description={m.experiment_description()}
        actions={
          <Can resource="experiment" action="write" mode="disable">
            <Button size="sm" onClick={openCreate}>
              <Plus />
              {m.experiment_new()}
            </Button>
          </Can>
        }
      />
      <PageBody>
        <Tabs
          value={status}
          onValueChange={(v) => setStatus(v as ExperimentStatus | "")}
        >
          <TabsList>
            {STATUS_TABS.map((s) => (
              <TabsTrigger key={s || "all"} value={s}>
                {statusLabel(s)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <ExperimentTable route={Route} status={status} />
      </PageBody>

      {modal === "create" ? (
        <CreateExperimentDrawer onClose={closeModal} />
      ) : null}
    </PageShell>
  )
}

function CreateExperimentDrawer({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const mutation = useCreateExperiment()
  const [formState, setFormState] = useState<ExperimentFormBridgeState>({
    canSubmit: false,
    isDirty: false,
  })

  return (
    <FormDrawer
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      isDirty={formState.isDirty && !mutation.isPending}
      title={m.experiment_create_title()}
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
            {mutation.isPending
              ? m.common_saving()
              : m.experiment_create_continue()}
          </Button>
        </>
      }
    >
      <ExperimentForm
        formId={FORM_ID}
        isPending={mutation.isPending}
        onStateChange={setFormState}
        onSubmit={async (values) => {
          try {
            const row = await mutation.mutateAsync(values)
            toast.success(m.experiment_created({ name: row.name }))
            onClose()
            void navigate({
              to: "/experiment/$experimentKey",
              params: { experimentKey: row.key },
            })
          } catch (err) {
            toast.error(
              err instanceof ApiError
                ? err.body.message
                : m.experiment_failed_generic(),
            )
          }
        }}
      />
    </FormDrawer>
  )
}
