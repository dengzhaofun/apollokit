import * as m from "#/paraglide/messages.js"
import { RewardEntryEditor } from "#/components/rewards/RewardEntryEditor"
import { Button } from "#/components/ui/button"
import {
  FormStateBridge,
  type FormBridgeState,
} from "#/components/ui/form-state-bridge"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import { Separator } from "#/components/ui/separator"
import { Switch } from "#/components/ui/switch"
import { Textarea } from "#/components/ui/textarea"
import type { CdkeyCodeType } from "#/lib/types/cdkey"

import type { BatchFormApi } from "./use-batch-form"

interface BatchFormProps {
  form: BatchFormApi
  isPending?: boolean
  submitLabel?: string
  id?: string
  hideSubmitButton?: boolean
  onStateChange?: (state: FormBridgeState) => void
}

export function CdkeyBatchForm({
  form,
  isPending,
  submitLabel,
  id,
  hideSubmitButton,
  onStateChange,
}: BatchFormProps) {
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

      <form.Field
        name="name"
        validators={{
          onChange: ({ value }) => (!value.trim() ? "Name is required" : undefined),
        }}
      >
        {(field) => (
          <div className="space-y-2">
            <Label>{m.common_name()}</Label>
            <Input
              required
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          </div>
        )}
      </form.Field>

      <form.Field name="alias">
        {(field) => (
          <div className="space-y-2">
            <Label>{m.common_alias()}</Label>
            <Input
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          </div>
        )}
      </form.Field>

      <form.Field name="description">
        {(field) => (
          <div className="space-y-2">
            <Label>{m.common_description()}</Label>
            <Textarea
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              rows={2}
            />
          </div>
        )}
      </form.Field>

      <form.Field name="codeType">
        {(field) => (
          <div className="space-y-2">
            <Label>{m.cdkey_code_type()}</Label>
            <Select
              value={field.state.value}
              onValueChange={(v) => field.handleChange(v as CdkeyCodeType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="universal">
                  {m.cdkey_code_type_universal()}
                </SelectItem>
                <SelectItem value="unique">
                  {m.cdkey_code_type_unique()}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </form.Field>

      <form.Subscribe selector={(s) => s.values.codeType}>
        {(codeType) =>
          codeType === "universal" ? (
            <>
              <form.Field name="universalCode">
                {(field) => (
                  <div className="space-y-2">
                    <Label>{m.cdkey_universal_code()}</Label>
                    <Input
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder={m.cdkey_optional_universal_code()}
                    />
                  </div>
                )}
              </form.Field>
              <form.Field name="totalLimit">
                {(field) => (
                  <div className="space-y-2">
                    <Label>{m.cdkey_total_limit()}</Label>
                    <Input
                      type="number"
                      min={1}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  </div>
                )}
              </form.Field>
            </>
          ) : (
            <form.Field name="initialCount">
              {(field) => (
                <div className="space-y-2">
                  <Label>{m.cdkey_initial_count()}</Label>
                  <Input
                    type="number"
                    min={1}
                    max={10000}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) =>
                      field.handleChange(Number(e.target.value) || 1)
                    }
                    required
                  />
                </div>
              )}
            </form.Field>
          )
        }
      </form.Subscribe>

      <form.Field name="perUserLimit">
        {(field) => (
          <div className="space-y-2">
            <Label>{m.cdkey_per_user_limit()}</Label>
            <Input
              type="number"
              min={1}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(Number(e.target.value) || 1)}
            />
          </div>
        )}
      </form.Field>

      <div className="grid grid-cols-2 gap-4">
        <form.Field name="startsAt">
          {(field) => (
            <div className="space-y-2">
              <Label>{m.cdkey_starts_at()}</Label>
              <Input
                type="datetime-local"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            </div>
          )}
        </form.Field>
        <form.Field name="endsAt">
          {(field) => (
            <div className="space-y-2">
              <Label>{m.cdkey_ends_at()}</Label>
              <Input
                type="datetime-local"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            </div>
          )}
        </form.Field>
      </div>

      <form.Field name="isActive">
        {(field) => (
          <div className="flex items-center gap-3">
            <Switch
              checked={field.state.value}
              onCheckedChange={(v) => field.handleChange(v === true)}
            />
            <Label>{m.common_active()}</Label>
          </div>
        )}
      </form.Field>

      <Separator />

      <form.Field name="reward">
        {(field) => (
          <RewardEntryEditor
            label={m.cdkey_reward()}
            entries={field.state.value}
            onChange={(v) => field.handleChange(v)}
          />
        )}
      </form.Field>

      {hideSubmitButton ? null : (
        <Button type="submit" disabled={isPending}>
          {submitLabel ?? m.common_create()}
        </Button>
      )}
    </form>
  )
}
