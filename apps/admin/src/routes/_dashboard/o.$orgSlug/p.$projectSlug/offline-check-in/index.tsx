import { useTenantParams } from "#/hooks/use-tenant-params";
import { useState } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { MapPin, Plus } from "lucide-react"
import { toast } from "sonner"

import { CampaignForm } from "#/components/offline-check-in/CampaignForm"
import { CampaignTable } from "#/components/offline-check-in/CampaignTable"
import { useCampaignForm } from "#/components/offline-check-in/use-campaign-form"
import { PageBody, PageHeader, PageShell } from "#/components/patterns"
import { Button } from "#/components/ui/button"
import { FormDrawerWithAssist } from "#/components/ui/form-drawer-with-assist"
import { Can } from "#/components/auth/Can"
import { useCreateOfflineCheckInCampaign } from "#/hooks/use-offline-check-in"
import { ApiError } from "#/lib/api-client"
import { listSearchSchema } from "#/lib/list-search"
import {
  closedModal,
  modalSearchSchema,
  openCreateModal,
} from "#/lib/modal-search"
import * as m from "#/paraglide/messages.js"

const FORM_ID = "offline-check-in-campaign-form"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/offline-check-in/")({
  component: OfflineCheckInListPage,
  validateSearch: modalSearchSchema.merge(listSearchSchema).passthrough(),
})

function OfflineCheckInListPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const modal = search.modal

  function closeModal() {
    void navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, ...closedModal }) })
  }
  function openCreate() {
    void navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, ...openCreateModal }) })
  }

  return (
    <PageShell>
      <PageHeader
        icon={<MapPin className="size-5" />}
        title={m.offline_checkin_title()}
        description={m.offline_checkin_description()}
        actions={
          <Can resource="offlineCheckIn" action="write" mode="disable">
            <Button size="sm" onClick={openCreate}>
              <Plus />
              {m.offline_checkin_new_campaign()}
            </Button>
          </Can>
        }
      />
      <PageBody>
        <CampaignTable route={Route} />
      </PageBody>

      {modal === "create" ? (
        <CreateCampaignDrawer onClose={closeModal} />
      ) : null}
    </PageShell>
  )
}

function CreateCampaignDrawer({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
    const { orgSlug, projectSlug } = useTenantParams()
  const mutation = useCreateOfflineCheckInCampaign()
  const [formState, setFormState] = useState({
    canSubmit: false,
    isDirty: false,
    isSubmitting: false,
  })

  const form = useCampaignForm({
    onSubmit: async (values) => {
      try {
        const row = await mutation.mutateAsync(values)
        toast.success(m.offline_checkin_campaign_created())
        onClose()
        void navigate({
          to: "/o/$orgSlug/p/$projectSlug/offline-check-in/$campaignId",
          params: { orgSlug, projectSlug, campaignId: row.id },
        })
      } catch (err) {
        toast.error(
          err instanceof ApiError
            ? err.body.error
            : m.offline_checkin_failed_create(),
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
      title={m.offline_checkin_create_campaign()}
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
      <CampaignForm
        id={FORM_ID}
        onStateChange={setFormState}
        isPending={mutation.isPending}
        form={form}
      />
    </FormDrawerWithAssist>
  )
}
