import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useNavigate } from "#/components/router-helpers"
import { format } from "date-fns"
import { Pencil, ArrowLeft, Play } from "lucide-react"
import { toast } from "sonner"
import { Link } from "#/components/router-helpers"
import * as m from "#/paraglide/messages.js"
import { Button } from "#/components/ui/button"
import { Badge } from "#/components/ui/badge"
import { ConfigForm } from "#/components/check-in/ConfigForm"
import { DeleteConfigDialog } from "#/components/check-in/DeleteConfigDialog"
import { UserStatesTable } from "#/components/check-in/UserStatesTable"
import { CheckInRewardsBlock } from "#/components/check-in/CheckInRewardsBlock"
import { useConfigForm } from "#/components/check-in/use-config-form"
import {
  useCheckInConfig,
  useUpdateCheckInConfig,
  useDeleteCheckInConfig,
} from "#/hooks/use-check-in"
import { ApiError } from "#/lib/api-client"
import { listSearchSchema } from "#/lib/list-search"
import type { CheckInConfig, UpdateConfigInput } from "#/lib/types/check-in"


function getResetModeLabels(): Record<string, string> {
  return {
    none: m.checkin_reset_none(),
    week: m.checkin_reset_weekly(),
    month: m.checkin_reset_monthly(),
  }
}

function getWeekDayLabels(): string[] {
  return [
    m.checkin_sunday(),
    m.checkin_monday(),
    m.checkin_tuesday(),
    m.checkin_wednesday(),
    m.checkin_thursday(),
    m.checkin_friday(),
    m.checkin_saturday(),
  ]
}

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/check-in/$configId/")({
  component: CheckInDetailPage,
  validateSearch: listSearchSchema.passthrough(),
})

function CheckInDetailPage() {
  const { configId } = Route.useParams()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)

  const RESET_MODE_LABEL = getResetModeLabels()
  const WEEK_DAY_LABELS = getWeekDayLabels()

  const { data: config, isPending, error } = useCheckInConfig(configId)
  const updateMutation = useUpdateCheckInConfig()
  const deleteMutation = useDeleteCheckInConfig()

  if (isPending) {
    return (
      <>
        <main className="flex h-40 items-center justify-center text-muted-foreground">
          {m.common_loading()}
        </main>
      </>
    )
  }

  if (error || !config) {
    return (
      <>
        <main className="flex h-40 items-center justify-center text-destructive">
          {error?.message ?? "Config not found"}
        </main>
      </>
    )
  }

  return (
    <>
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button
              render={
                <Link to="/check-in">
                  <ArrowLeft className="size-4" />
                  {m.common_back()}
                </Link>
              }
              variant="outline" size="sm"
            />
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing(!editing)}
              >
                <Pencil className="size-4" />
                {editing ? m.common_cancel() : m.common_edit()}
              </Button>
              <DeleteConfigDialog
                configName={config.name}
                isPending={deleteMutation.isPending}
                onConfirm={async () => {
                  try {
                    await deleteMutation.mutateAsync(config.id)
                    toast.success(m.checkin_config_deleted())
                    navigate({ to: "/o/$orgSlug/p/$projectSlug/check-in" })
                  } catch (err) {
                    if (err instanceof ApiError) {
                      toast.error(err.body.error)
                    } else {
                      toast.error(m.checkin_failed_delete_config())
                    }
                  }
                }}
              />
            </div>
          </div>

          {editing ? (
            <div className="rounded-xl border bg-card p-6 shadow-sm">
              <EditCheckInForm
                config={config}
                isPending={updateMutation.isPending}
                onSave={async (values) => {
                  try {
                    await updateMutation.mutateAsync({ id: config.id, ...values })
                    toast.success(m.checkin_config_updated())
                    setEditing(false)
                  } catch (err) {
                    if (err instanceof ApiError) {
                      toast.error(err.body.error)
                    } else {
                      toast.error(m.checkin_failed_update_config())
                    }
                  }
                }}
              />
            </div>
          ) : (
            <div className="rounded-xl border bg-card p-6 shadow-sm">
              <div className="grid gap-4 sm:grid-cols-2">
                <DetailItem label={m.common_name()} value={config.name} />
                <DetailItem
                  label={m.common_alias()}
                  value={
                    config.alias ? (
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        {config.alias}
                      </code>
                    ) : (
                      "—"
                    )
                  }
                />
                <DetailItem
                  label={m.checkin_reset_mode()}
                  value={
                    <Badge variant="secondary">
                      {RESET_MODE_LABEL[config.resetMode] ?? config.resetMode}
                    </Badge>
                  }
                />
                {config.resetMode === "week" && (
                  <DetailItem
                    label={m.checkin_week_starts_on()}
                    value={WEEK_DAY_LABELS[config.weekStartsOn] ?? config.weekStartsOn}
                  />
                )}
                <DetailItem
                  label={m.checkin_target()}
                  value={config.target != null ? `${config.target} ${m.checkin_days()}` : "—"}
                />
                <DetailItem label={m.checkin_timezone()} value={config.timezone} />
                <DetailItem
                  label={m.common_status()}
                  value={
                    <Badge variant={config.isActive ? "default" : "outline"}>
                      {config.isActive ? m.common_active() : m.common_inactive()}
                    </Badge>
                  }
                />
                <DetailItem
                  label={m.common_created()}
                  value={format(new Date(config.createdAt), "yyyy-MM-dd HH:mm")}
                />
                <DetailItem
                  label="Updated"
                  value={format(new Date(config.updatedAt), "yyyy-MM-dd HH:mm")}
                />
                {config.description && (
                  <div className="sm:col-span-2">
                    <DetailItem label={m.common_description()} value={config.description} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Rewards — always visible (independent from basic-info edit mode) */}
          <CheckInRewardsBlock configKey={configId} />

          {/* Preview link */}
          {!editing && (
            <Button
              render={
                <Link
                  to="/check-in/$configId/preview"
                  params={{ configId }}
                >
                  <Play className="size-4" />
                  {m.checkin_preview_test()}
                </Link>
              }
              variant="outline" size="sm"
            />
          )}

          {/* User States (read-only) */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">{m.checkin_checkin_users()}</h3>
            <UserStatesTable configKey={configId} route={Route} />
          </div>
        </div>
      </main>
    </>
  )
}

function DetailItem({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="text-sm">{value}</div>
    </div>
  )
}

/**
 * Edit form is split into its own component so that `useConfigForm`
 * (which calls `useForm`) is only invoked while the user is actively
 * editing — keeps the form state localized to the edit lifecycle and
 * avoids rebuilding the controller on every detail-page render.
 *
 * Note: the AI assist panel is intentionally NOT wired up here in the
 * MVP. Editing tends to be small targeted changes; assist is most
 * useful from a blank slate. Adding it later is a one-liner — see
 * `<AIAssistPanel surface="check-in:edit" ... />` in the create
 * drawer for the pattern.
 */
function EditCheckInForm({
  config,
  isPending,
  onSave,
}: {
  config: CheckInConfig
  isPending: boolean
  onSave: (values: UpdateConfigInput) => void | Promise<void>
}) {
  const form = useConfigForm({
    defaultValues: {
      name: config.name,
      alias: config.alias,
      description: config.description,
      resetMode: config.resetMode,
      weekStartsOn: config.weekStartsOn,
      target: config.target,
      timezone: config.timezone,
      isActive: config.isActive,
    },
    onSubmit: onSave,
  })
  return (
    <ConfigForm
      form={form}
      submitLabel={m.common_save_changes()}
      isPending={isPending}
    />
  )
}
