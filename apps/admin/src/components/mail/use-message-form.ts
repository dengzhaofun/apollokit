import { useForm } from "@tanstack/react-form"

import * as m from "#/paraglide/messages.js"
import type { CreateMailInput, MailTargetType } from "#/lib/types/mail"
import type { RewardEntry } from "#/lib/types/rewards"

export type MailFormValues = {
  title: string
  content: string
  targetType: MailTargetType
  recipientsRaw: string
  requireRead: boolean
  expiresAt: string
  entries: RewardEntry[]
  formError: string
}

export function useMessageForm({
  onSubmit,
}: {
  onSubmit: (values: CreateMailInput) => void | Promise<void>
}) {
  return useForm({
    // Cast `defaultValues` to the explicit shape so TanStack Form
    // doesn't infer literal types (`false` instead of `boolean`) — that
    // would prevent later `setFieldValue("requireRead", true)` calls.
    defaultValues: {
      title: "",
      content: "",
      targetType: "broadcast" as MailTargetType,
      recipientsRaw: "",
      requireRead: false,
      expiresAt: "",
      entries: [] as RewardEntry[],
      formError: "",
    } as MailFormValues,
    onSubmit: async ({ value, formApi }) => {
      formApi.setFieldValue("formError", "")

      if (!value.title.trim() || !value.content.trim()) {
        formApi.setFieldValue("formError", m.mail_error_title_content_required())
        return
      }

      const rewards = value.entries.filter((e) => e.id && e.count > 0)

      let targetUserIds: string[] | undefined
      if (value.targetType === "multicast") {
        targetUserIds = value.recipientsRaw
          .split(/[\n,]/)
          .map((s) => s.trim())
          .filter(Boolean)
        if (targetUserIds.length === 0) {
          formApi.setFieldValue(
            "formError",
            m.mail_error_recipients_required(),
          )
          return
        }
      }

      const payload: CreateMailInput = {
        title: value.title.trim(),
        content: value.content.trim(),
        rewards,
        targetType: value.targetType,
        targetUserIds,
        requireRead: value.requireRead,
        expiresAt: value.expiresAt
          ? new Date(value.expiresAt).toISOString()
          : null,
      }
      await onSubmit(payload)
    },
  })
}

export type MessageFormApi = ReturnType<typeof useMessageForm>
