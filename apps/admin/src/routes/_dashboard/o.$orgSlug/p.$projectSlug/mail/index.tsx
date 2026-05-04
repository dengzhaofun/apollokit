import { useState } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { toast } from "sonner"

import * as m from "#/paraglide/messages.js"
import { PageHeaderActions } from "#/components/PageHeader"
import { Button } from "#/components/ui/button"
import { FormDrawerWithAssist } from "#/components/ui/form-drawer-with-assist"
import { Can } from "#/components/auth/Can"
import { MessageForm } from "#/components/mail/MessageForm"
import { useMessageForm } from "#/components/mail/use-message-form"
import { MessageTable } from "#/components/mail/MessageTable"
import { useCreateMailMessage } from "#/hooks/use-mail"
import { ApiError } from "#/lib/api-client"
import { listSearchSchema } from "#/lib/list-search"
import {
  closedModal,
  modalSearchSchema,
  openCreateModal,
} from "#/lib/modal-search"

const FORM_ID = "mail-message-form"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/mail/")({
  component: MailListPage,
  validateSearch: modalSearchSchema.merge(listSearchSchema).passthrough(),
})

function MailListPage() {
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
    <>
      <PageHeaderActions>
        <div className="ml-auto">
          <Can resource="mail" action="write" mode="disable">
            <Button size="sm" onClick={openCreate}>
              <Plus className="size-4" />
              {m.mail_new_message()}
            </Button>
          </Can>
        </div>
      </PageHeaderActions>

      <main className="flex-1 p-6">
        <MessageTable route={Route} />
      </main>

      {modal === "create" ? <CreateMailDrawer onClose={closeModal} /> : null}
    </>
  )
}

function CreateMailDrawer({ onClose }: { onClose: () => void }) {
  const mutation = useCreateMailMessage()
  const [formState, setFormState] = useState({
    canSubmit: false,
    isDirty: false,
    isSubmitting: false,
  })
  const form = useMessageForm({
    onSubmit: async (values) => {
      try {
        await mutation.mutateAsync(values)
        toast.success("Mail sent")
        onClose()
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.body.error : "Failed to send mail",
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
      title={m.mail_new_message()}
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
      <MessageForm
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
