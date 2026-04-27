import { Button } from "#/components/ui/button"
import { FieldHint } from "#/components/ui/field-hint"
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
import { Switch } from "#/components/ui/switch"
import { Textarea } from "#/components/ui/textarea"
import type {
  AssistContributionPolicy,
  AssistPoolMode,
} from "#/lib/types/assist-pool"
import * as m from "#/paraglide/messages.js"

import type { AssistPoolFormApi } from "./use-config-form"

type PolicyKind = AssistContributionPolicy["kind"]

interface ConfigFormProps {
  form: AssistPoolFormApi
  isPending?: boolean
  submitLabel?: string
  id?: string
  hideSubmitButton?: boolean
  onStateChange?: (state: FormBridgeState) => void
}

export function AssistPoolConfigForm({
  form,
  isPending,
  submitLabel,
  id,
  hideSubmitButton,
  onStateChange,
}: ConfigFormProps) {
  return (
    <form
      id={id}
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
        form.handleSubmit()
      }}
      className="space-y-6"
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
          onChange: ({ value }) => (!value.trim() ? "Name required" : undefined),
        }}
      >
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor="name">{m.assistpool_name()}</Label>
            <Input
              id="name"
              required
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder={m.assistpool_name_placeholder()}
            />
          </div>
        )}
      </form.Field>

      <form.Field name="alias">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor="alias" className="inline-flex items-center gap-1.5">
              {m.assistpool_alias_optional()}
              <FieldHint>{m.assistpool_alias_help()}</FieldHint>
            </Label>
            <Input
              id="alias"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder={m.assistpool_alias_placeholder()}
            />
          </div>
        )}
      </form.Field>

      <form.Field name="description">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor="description">{m.assistpool_description()}</Label>
            <Textarea
              id="description"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              rows={2}
            />
          </div>
        )}
      </form.Field>

      <div className="grid grid-cols-2 gap-4">
        <form.Field name="mode">
          {(field) => (
            <div className="space-y-2">
              <Label>{m.assistpool_mode()}</Label>
              <Select
                value={field.state.value}
                onValueChange={(v) => field.handleChange(v as AssistPoolMode)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="decrement">
                    {m.assistpool_mode_decrement()}
                  </SelectItem>
                  <SelectItem value="accumulate">
                    {m.assistpool_mode_accumulate()}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </form.Field>

        <form.Field name="targetAmount">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor="target">{m.assistpool_target_amount()}</Label>
              <Input
                id="target"
                type="number"
                min={1}
                required
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) =>
                  field.handleChange(Number(e.target.value) || 1)
                }
              />
            </div>
          )}
        </form.Field>
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <Label>{m.assistpool_policy()}</Label>
        <form.Field name="policyKind">
          {(field) => (
            <Select
              value={field.state.value}
              onValueChange={(v) => field.handleChange(v as PolicyKind)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">
                  {m.assistpool_policy_fixed()}
                </SelectItem>
                <SelectItem value="uniform">
                  {m.assistpool_policy_uniform()}
                </SelectItem>
                <SelectItem value="decaying">
                  {m.assistpool_policy_decaying()}
                </SelectItem>
              </SelectContent>
            </Select>
          )}
        </form.Field>

        <form.Subscribe selector={(s) => s.values.policyKind}>
          {(policyKind) =>
            policyKind === "fixed" ? (
              <form.Field name="fixedAmount">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor="fixed-amount">
                      {m.assistpool_amount_per_assist()}
                    </Label>
                    <Input
                      id="fixed-amount"
                      type="number"
                      min={1}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) =>
                        field.handleChange(Number(e.target.value) || 1)
                      }
                    />
                  </div>
                )}
              </form.Field>
            ) : policyKind === "uniform" ? (
              <div className="grid grid-cols-2 gap-3">
                <form.Field name="uniformMin">
                  {(field) => (
                    <div className="space-y-2">
                      <Label htmlFor="uniform-min">{m.assistpool_min()}</Label>
                      <Input
                        id="uniform-min"
                        type="number"
                        min={1}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) =>
                          field.handleChange(Number(e.target.value) || 1)
                        }
                      />
                    </div>
                  )}
                </form.Field>
                <form.Field name="uniformMax">
                  {(field) => (
                    <div className="space-y-2">
                      <Label htmlFor="uniform-max">{m.assistpool_max()}</Label>
                      <Input
                        id="uniform-max"
                        type="number"
                        min={1}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) =>
                          field.handleChange(Number(e.target.value) || 1)
                        }
                      />
                    </div>
                  )}
                </form.Field>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                <form.Field name="decayBase">
                  {(field) => (
                    <div className="space-y-2">
                      <Label htmlFor="decay-base">{m.assistpool_base()}</Label>
                      <Input
                        id="decay-base"
                        type="number"
                        min={1}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) =>
                          field.handleChange(Number(e.target.value) || 1)
                        }
                      />
                    </div>
                  )}
                </form.Field>
                <form.Field name="decayTailRatio">
                  {(field) => (
                    <div className="space-y-2">
                      <Label htmlFor="decay-tail-ratio">
                        {m.assistpool_tail_ratio()}
                      </Label>
                      <Input
                        id="decay-tail-ratio"
                        type="number"
                        step="0.01"
                        min={0}
                        max={1}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) =>
                          field.handleChange(Number(e.target.value))
                        }
                      />
                    </div>
                  )}
                </form.Field>
                <form.Field name="decayTailFloor">
                  {(field) => (
                    <div className="space-y-2">
                      <Label htmlFor="decay-floor">
                        {m.assistpool_tail_floor()}
                      </Label>
                      <Input
                        id="decay-floor"
                        type="number"
                        min={1}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) =>
                          field.handleChange(Number(e.target.value) || 1)
                        }
                      />
                    </div>
                  )}
                </form.Field>
              </div>
            )
          }
        </form.Subscribe>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <form.Field name="perAssisterLimit">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor="per-assister">
                {m.assistpool_per_assister_limit()}
              </Label>
              <Input
                id="per-assister"
                type="number"
                min={1}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) =>
                  field.handleChange(Number(e.target.value) || 1)
                }
              />
            </div>
          )}
        </form.Field>
        <form.Field name="expiresInSeconds">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor="ttl">{m.assistpool_expires_in_seconds()}</Label>
              <Input
                id="ttl"
                type="number"
                min={1}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) =>
                  field.handleChange(Number(e.target.value) || 1)
                }
              />
            </div>
          )}
        </form.Field>
      </div>

      <form.Field name="initiatorCanAssist">
        {(field) => (
          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label htmlFor="initiator-can-assist" className="inline-flex items-center gap-1.5">
              {m.assistpool_initiator_can_assist()}
              <FieldHint>{m.assistpool_initiator_can_assist_help()}</FieldHint>
            </Label>
            <Switch
              id="initiator-can-assist"
              checked={field.state.value}
              onCheckedChange={(v) => field.handleChange(v === true)}
            />
          </div>
        )}
      </form.Field>

      <form.Field name="isActive">
        {(field) => (
          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label htmlFor="active" className="inline-flex items-center gap-1.5">
              {m.assistpool_active()}
              <FieldHint>{m.assistpool_active_help()}</FieldHint>
            </Label>
            <Switch
              id="active"
              checked={field.state.value}
              onCheckedChange={(v) => field.handleChange(v === true)}
            />
          </div>
        )}
      </form.Field>

      {hideSubmitButton ? null : (
        <form.Subscribe selector={(s) => s.canSubmit}>
          {(canSubmit) => (
            <div className="flex justify-end">
              <Button type="submit" disabled={isPending || !canSubmit}>
                {isPending
                  ? m.assistpool_creating()
                  : (submitLabel ?? m.assistpool_create())}
              </Button>
            </div>
          )}
        </form.Subscribe>
      )}
    </form>
  )
}
