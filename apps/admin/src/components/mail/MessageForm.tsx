import * as m from "#/paraglide/messages.js"
import { RewardEntryEditor } from "#/components/rewards/RewardEntryEditor"
import { Button } from "#/components/ui/button"
import { FieldHint } from "#/components/ui/field-hint"
import {
  FormStateBridge,
  type FormBridgeState,
} from "#/components/ui/form-state-bridge"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { Textarea } from "#/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import { Switch } from "#/components/ui/switch"
import type { MailTargetType } from "#/lib/types/mail"

import type { MessageFormApi } from "./use-message-form"

interface MessageFormProps {
  /** Form instance owned by the caller — see `use-message-form.ts`. */
  form: MessageFormApi
  isPending?: boolean
  submitLabel?: string
  id?: string
  hideSubmitButton?: boolean
  onStateChange?: (state: FormBridgeState) => void
}

export function MessageForm({
  form,
  isPending,
  submitLabel,
  id,
  hideSubmitButton,
  onStateChange,
}: MessageFormProps) {
  return (
    <form
      id={id}
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
        form.handleSubmit()
      }}
      className="space-y-4"
    >
      {onStateChange ? (
        <form.Subscribe
          selector={(s) => ({
            canSubmit: s.canSubmit,
            isDirty: s.isDirty,
            isSubmitting: s.isSubmitting,
          })}
        >
          {(state) => <FormStateBridge state={state} onChange={onStateChange} />}
        </form.Subscribe>
      ) : null}

      <form.Field name="title">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor="mail-title">{m.mail_field_title()} *</Label>
            <Input
              id="mail-title"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              maxLength={200}
            />
          </div>
        )}
      </form.Field>

      <form.Field name="content">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor="mail-content">{m.mail_field_content()} *</Label>
            <Textarea
              id="mail-content"
              rows={6}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              maxLength={10_000}
            />
          </div>
        )}
      </form.Field>

      <form.Field name="targetType">
        {(field) => (
          <div className="space-y-2">
            <Label className="inline-flex items-center gap-1.5">
              {m.mail_field_target_type()} *
              <FieldHint>{m.mail_field_target_hint()}</FieldHint>
            </Label>
            <Select
              value={field.state.value}
              onValueChange={(v) => field.handleChange(v as MailTargetType)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="broadcast">
                  {m.mail_target_broadcast()}
                </SelectItem>
                <SelectItem value="multicast">
                  {m.mail_target_multicast()}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </form.Field>

      <form.Subscribe selector={(s) => s.values.targetType}>
        {(targetType) =>
          targetType === "multicast" ? (
            <form.Field name="recipientsRaw">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="mail-recipients" className="inline-flex items-center gap-1.5">
                    {m.mail_field_recipients()} *
                    <FieldHint>{m.mail_field_recipients_hint()}</FieldHint>
                  </Label>
                  <Textarea
                    id="mail-recipients"
                    rows={4}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="user-1, user-2&#10;user-3"
                  />
                </div>
              )}
            </form.Field>
          ) : null
        }
      </form.Subscribe>

      <form.Field name="entries">
        {(field) => (
          <RewardEntryEditor
            label={m.mail_field_rewards()}
            entries={field.state.value}
            onChange={(v) => field.handleChange(v)}
            hint={m.mail_field_rewards_hint()}
          />
        )}
      </form.Field>

      <form.Field name="requireRead">
        {(field) => (
          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label className="inline-flex items-center gap-1.5">
              {m.mail_field_require_read()}
              <FieldHint>{m.mail_field_require_read_hint()}</FieldHint>
            </Label>
            <Switch
              checked={field.state.value}
              onCheckedChange={(v) => field.handleChange(v === true)}
            />
          </div>
        )}
      </form.Field>

      <form.Field name="expiresAt">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor="mail-expires" className="inline-flex items-center gap-1.5">
              {m.mail_field_expires_at()}
              <FieldHint>{m.mail_field_expires_at_hint()}</FieldHint>
            </Label>
            <Input
              id="mail-expires"
              type="datetime-local"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          </div>
        )}
      </form.Field>

      <form.Subscribe selector={(s) => s.values.formError}>
        {(formError) =>
          formError ? <p className="text-sm text-destructive">{formError}</p> : null
        }
      </form.Subscribe>

      {hideSubmitButton ? null : (
        <Button type="submit" disabled={isPending}>
          {isPending ? m.common_loading() : (submitLabel ?? m.common_create())}
        </Button>
      )}
    </form>
  )
}
