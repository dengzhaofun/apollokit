import { useForm } from "@tanstack/react-form"
import { useState } from "react"

import { FormGrid, FormSection, JsonEditor } from "#/components/patterns"
import { Button } from "#/components/ui/button"
import { FieldHint } from "#/components/ui/field-hint"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import { Textarea } from "#/components/ui/textarea"
import type {
  ActivityKind,
  ActivityMembershipConfig,
  ActivityMilestoneTier,
  CreateActivityInput,
  RewardEntry,
} from "#/lib/types/activity"
import * as m from "#/paraglide/messages.js"

/** Convert ISO to the `<input type="datetime-local">` value format (no tz). */
function toLocalInput(iso: string | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalInput(val: string): string {
  if (!val) return ""
  return new Date(val).toISOString()
}

/** Add `days` days to a `<input type="datetime-local">` string. */
function addDaysLocal(localVal: string, days: number): string {
  if (!localVal) return ""
  const d = new Date(localVal)
  if (Number.isNaN(d.getTime())) return ""
  d.setDate(d.getDate() + days)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * 简单模式下，从 startAt/endAt 推出剩余 3 个时间点：
 *   - visibleAt   = startAt          (无预热期)
 *   - rewardEndAt = endAt + 7 天     (默认 7 天领奖窗口)
 *   - hiddenAt    = rewardEndAt + 30 天  (默认 30 天后归档)
 * 想自定义就切到进阶模式。
 */
function deriveSimpleTimes(startLocal: string, endLocal: string) {
  const rewardEnd = addDaysLocal(endLocal, 7)
  return {
    visibleAtLocal: startLocal,
    rewardEndAtLocal: rewardEnd,
    hiddenAtLocal: addDaysLocal(rewardEnd, 30),
  }
}

/**
 * 决定打开表单时默认是简单还是进阶模式：
 * 编辑现有活动时，如果 visibleAt/rewardEndAt/hiddenAt 与简单模式
 * 推导值偏离很多（比如有真预热期、奖励窗口非 7 天），就走进阶模式
 * 让用户看到所有字段；新建（默认值都为空）就走简单模式。
 */
function shouldStartInAdvancedMode(
  defaults?: Partial<{
    visibleAt: string
    startAt: string
    endAt: string
    rewardEndAt: string
    hiddenAt: string
  }>,
): boolean {
  if (!defaults?.startAt || !defaults?.endAt) return false
  const startLocal = toLocalInput(defaults.startAt)
  const endLocal = toLocalInput(defaults.endAt)
  const derived = deriveSimpleTimes(startLocal, endLocal)
  const cur = {
    visibleAtLocal: toLocalInput(defaults.visibleAt),
    rewardEndAtLocal: toLocalInput(defaults.rewardEndAt),
    hiddenAtLocal: toLocalInput(defaults.hiddenAt),
  }
  return (
    cur.visibleAtLocal !== derived.visibleAtLocal ||
    cur.rewardEndAtLocal !== derived.rewardEndAtLocal ||
    cur.hiddenAtLocal !== derived.hiddenAtLocal
  )
}

interface Props {
  defaultValues?: Partial<CreateActivityInput>
  onSubmit: (values: CreateActivityInput) => void | Promise<void>
  isPending?: boolean
  submitLabel?: string
  disableAliasEdit?: boolean
  /**
   * Lock the time fields (visibleAt / startAt / endAt / rewardEndAt /
   * hiddenAt) when the activity has already left the draft phase. The
   * server will reject changes anyway; this is a UX hint that surfaces
   * the constraint *before* the user fills in invalid values.
   */
  lockTimeEdit?: boolean
}

export function ActivityForm({
  defaultValues,
  onSubmit,
  isPending,
  submitLabel,
  disableAliasEdit = false,
  lockTimeEdit = false,
}: Props) {
  const [advancedMode, setAdvancedMode] = useState(() =>
    shouldStartInAdvancedMode(defaultValues),
  )
  const form = useForm({
    defaultValues: {
      alias: defaultValues?.alias ?? "",
      name: defaultValues?.name ?? "",
      description: defaultValues?.description ?? "",
      bannerImage: defaultValues?.bannerImage ?? "",
      themeColor: defaultValues?.themeColor ?? "",
      kind: defaultValues?.kind ?? ("generic" as ActivityKind),
      timezone:
        defaultValues?.timezone ??
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      visibleAtLocal: toLocalInput(defaultValues?.visibleAt),
      startAtLocal: toLocalInput(defaultValues?.startAt),
      endAtLocal: toLocalInput(defaultValues?.endAt),
      rewardEndAtLocal: toLocalInput(defaultValues?.rewardEndAt),
      hiddenAtLocal: toLocalInput(defaultValues?.hiddenAt),
      milestoneTiersJson: JSON.stringify(
        defaultValues?.milestoneTiers ?? [],
        null,
        2,
      ),
      globalRewardsJson: JSON.stringify(
        defaultValues?.globalRewards ?? [],
        null,
        2,
      ),
      cleanupMode: (defaultValues?.cleanupRule?.mode ?? "purge") as
        | "purge"
        | "convert"
        | "keep",
      membershipJson: defaultValues?.membership
        ? JSON.stringify(defaultValues.membership, null, 2)
        : "",
    },
    onSubmit: async ({ value }) => {
      let milestoneTiers: ActivityMilestoneTier[] = []
      let globalRewards: RewardEntry[] = []
      try {
        milestoneTiers = JSON.parse(
          value.milestoneTiersJson,
        ) as ActivityMilestoneTier[]
      } catch {
        /* ignore */
      }
      try {
        globalRewards = JSON.parse(value.globalRewardsJson) as RewardEntry[]
      } catch {
        /* ignore */
      }

      let membership: ActivityMembershipConfig | null = null
      if (value.membershipJson.trim()) {
        try {
          membership = JSON.parse(value.membershipJson) as ActivityMembershipConfig
        } catch {
          /* ignore */
        }
      }

      await onSubmit({
        alias: value.alias,
        name: value.name,
        description: value.description || null,
        bannerImage: value.bannerImage || null,
        themeColor: value.themeColor || null,
        kind: value.kind,
        timezone: value.timezone,
        visibleAt: fromLocalInput(value.visibleAtLocal),
        startAt: fromLocalInput(value.startAtLocal),
        endAt: fromLocalInput(value.endAtLocal),
        rewardEndAt: fromLocalInput(value.rewardEndAtLocal),
        hiddenAt: fromLocalInput(value.hiddenAtLocal),
        milestoneTiers,
        globalRewards,
        cleanupRule: { mode: value.cleanupMode as "purge" | "convert" | "keep" },
        membership,
      })
    },
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        form.handleSubmit()
      }}
      className="flex flex-col"
    >
      {/* Section 1:基本信息 */}
      <FormSection
        title={m.activity_field_alias_label() + " · " + m.activity_field_name()}
        description="活动的展示文案 + 唯一标识"
      >
        <FormGrid cols={2}>
          <form.Field name="alias">
            {(field) => (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={field.name}>{m.activity_field_alias_label()}</Label>
                <Input
                  id={field.name}
                  value={field.state.value}
                  onChange={(e) =>
                    field.handleChange(e.target.value.toLowerCase())
                  }
                  placeholder="spring_festival_2026"
                  required
                  disabled={disableAliasEdit}
                />
              </div>
            )}
          </form.Field>

          <form.Field name="name">
            {(field) => (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={field.name}>{m.activity_field_name()}</Label>
                <Input
                  id={field.name}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  required
                />
              </div>
            )}
          </form.Field>
        </FormGrid>

        <form.Field name="description">
          {(field) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={field.name}>{m.common_description()}</Label>
              <Textarea
                id={field.name}
                value={field.state.value ?? ""}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            </div>
          )}
        </form.Field>

        <FormGrid cols={2}>
          <form.Field name="kind">
            {(field) => (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={field.name}>{m.activity_field_kind_label()}</Label>
                <Select
                  value={field.state.value}
                  onValueChange={(v) => field.handleChange(v as ActivityKind)}
                >
                  <SelectTrigger id={field.name}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="generic">{m.activity_kind_generic()}</SelectItem>
                    <SelectItem value="check_in_only">check_in_only</SelectItem>
                    <SelectItem value="board_game">board_game</SelectItem>
                    <SelectItem value="gacha">gacha</SelectItem>
                    <SelectItem value="season_pass">season_pass</SelectItem>
                    <SelectItem value="custom">custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </form.Field>

          <form.Field name="timezone">
            {(field) => (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={field.name}>{m.activity_field_timezone_label()}</Label>
                <Input
                  id={field.name}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              </div>
            )}
          </form.Field>
        </FormGrid>
      </FormSection>

      {/* Section 2:时间安排 */}
      <FormSection
        title={m.activity_lifecycle_legend()}
        description={
          advancedMode
            ? m.activity_lifecycle_invariant()
            : m.activity_lifecycle_simple_description()
        }
      >
        {lockTimeEdit ? (
          <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {m.activity_lifecycle_locked_warning()}
          </div>
        ) : null}
        <div className="mb-3 flex items-center justify-end">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={lockTimeEdit}
            onClick={() => {
              if (advancedMode) {
                // 切回简单模式：用 start/end 重新推导其余 3 个
                const start = form.getFieldValue("startAtLocal")
                const end = form.getFieldValue("endAtLocal")
                if (start && end) {
                  const d = deriveSimpleTimes(start, end)
                  form.setFieldValue("visibleAtLocal", d.visibleAtLocal)
                  form.setFieldValue("rewardEndAtLocal", d.rewardEndAtLocal)
                  form.setFieldValue("hiddenAtLocal", d.hiddenAtLocal)
                }
              }
              setAdvancedMode((v) => !v)
            }}
          >
            {advancedMode
              ? m.activity_lifecycle_switch_simple()
              : m.activity_lifecycle_switch_advanced()}
          </Button>
        </div>

        <FormGrid cols={2}>
          <form.Field name="startAtLocal">
            {(field) => (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={field.name}>{m.activity_field_start_at()}</Label>
                <Input
                  id={field.name}
                  type="datetime-local"
                  disabled={lockTimeEdit}
                  value={field.state.value}
                  onChange={(e) => {
                    const v = e.target.value
                    field.handleChange(v)
                    // 简单模式下，开始时间改了就立即同步 visibleAt
                    if (!advancedMode && v) {
                      form.setFieldValue("visibleAtLocal", v)
                    }
                  }}
                  required
                />
              </div>
            )}
          </form.Field>
          <form.Field name="endAtLocal">
            {(field) => (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={field.name}>{m.activity_field_end_at()}</Label>
                <Input
                  id={field.name}
                  type="datetime-local"
                  disabled={lockTimeEdit}
                  value={field.state.value}
                  onChange={(e) => {
                    const v = e.target.value
                    field.handleChange(v)
                    // 简单模式下，结束时间改了就重新推导 rewardEnd / hidden
                    if (!advancedMode && v) {
                      const rewardEnd = addDaysLocal(v, 7)
                      form.setFieldValue("rewardEndAtLocal", rewardEnd)
                      form.setFieldValue(
                        "hiddenAtLocal",
                        addDaysLocal(rewardEnd, 30),
                      )
                    }
                  }}
                  required
                />
              </div>
            )}
          </form.Field>

          {advancedMode ? (
            <>
              <form.Field name="visibleAtLocal">
                {(field) => (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={field.name}>
                      {m.activity_field_visible_at()}
                    </Label>
                    <Input
                      id={field.name}
                      type="datetime-local"
                      disabled={lockTimeEdit}
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      required
                    />
                  </div>
                )}
              </form.Field>
              <form.Field name="rewardEndAtLocal">
                {(field) => (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={field.name}>
                      {m.activity_field_reward_end_at()}
                    </Label>
                    <Input
                      id={field.name}
                      type="datetime-local"
                      disabled={lockTimeEdit}
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      required
                    />
                  </div>
                )}
              </form.Field>
              <form.Field name="hiddenAtLocal">
                {(field) => (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={field.name}>
                      {m.activity_field_hidden_at()}
                    </Label>
                    <Input
                      id={field.name}
                      type="datetime-local"
                      disabled={lockTimeEdit}
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      required
                    />
                  </div>
                )}
              </form.Field>
            </>
          ) : null}
        </FormGrid>

        {!advancedMode ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {m.activity_lifecycle_simple_hint()}
          </p>
        ) : null}
      </FormSection>

      {/* Section 3:经济 / 奖励 / 成员配置 —— 全 JSON */}
      <FormSection
        title={m.activity_section_rewards_title()}
        description={m.activity_section_rewards_desc()}
      >
        <form.Field name="milestoneTiersJson">
          {(field) => (
            <div className="flex flex-col gap-1.5">
              <Label>{m.activity_field_milestones_json()}</Label>
              <JsonEditor
                value={field.state.value}
                onChange={(v) => field.handleChange(v)}
                placeholder='[{"alias":"m1","points":100,"rewards":[{"type":"item","id":"gold-uuid","count":1000}]}]'
                height={200}
                aria-label={m.activity_field_milestones_json()}
              />
            </div>
          )}
        </form.Field>

        <form.Field name="globalRewardsJson">
          {(field) => (
            <div className="flex flex-col gap-1.5">
              <Label>{m.activity_field_global_rewards_json()}</Label>
              <JsonEditor
                value={field.state.value}
                onChange={(v) => field.handleChange(v)}
                placeholder='[{"type":"item","id":"trophy-uuid","count":1}]'
                height={140}
                aria-label={m.activity_field_global_rewards_json()}
              />
            </div>
          )}
        </form.Field>

        <form.Field name="membershipJson">
          {(field) => (
            <div className="flex flex-col gap-1.5">
              <Label className="inline-flex items-center gap-1.5">
                {m.activity_form_membership_json()}
                <FieldHint>{m.activity_form_membership_hint()}</FieldHint>
              </Label>
              <JsonEditor
                value={field.state.value}
                onChange={(v) => field.handleChange(v)}
                placeholder={`{"leaveAllowed":true,"queue":{"enabled":false,"format":"numeric","length":4}}`}
                height={140}
                aria-label={m.activity_form_membership_json()}
              />
            </div>
          )}
        </form.Field>
      </FormSection>

      {/* Section 4:清理策略 */}
      <FormSection
        title={m.activity_field_cleanup_mode()}
        description="活动结束后玩家持有的活动货币 / 临时道具的去向"
      >
        <form.Field name="cleanupMode">
          {(field) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={field.name}>{m.activity_field_cleanup_mode()}</Label>
              <Select
                value={field.state.value}
                onValueChange={(v) =>
                  field.handleChange(v as "purge" | "convert" | "keep")
                }
              >
                <SelectTrigger id={field.name}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="purge">{m.activity_cleanup_purge()}</SelectItem>
                  <SelectItem value="convert">{m.activity_cleanup_convert()}</SelectItem>
                  <SelectItem value="keep">{m.activity_cleanup_keep()}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </form.Field>
      </FormSection>

      <div className="flex justify-end pt-4">
        <Button type="submit" disabled={isPending}>
          {isPending ? m.activity_submitting() : (submitLabel ?? m.common_create())}
        </Button>
      </div>
    </form>
  )
}
