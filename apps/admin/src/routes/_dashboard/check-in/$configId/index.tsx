import { useState } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { format } from "date-fns"
import { Pencil, ArrowLeft, Play } from "lucide-react"
import { toast } from "sonner"
import { Link } from "@tanstack/react-router"

import * as m from "#/paraglide/messages.js"
import { SidebarTrigger } from "#/components/ui/sidebar"
import { Separator } from "#/components/ui/separator"
import { Button } from "#/components/ui/button"
import { Badge } from "#/components/ui/badge"
import { ConfigForm } from "#/components/check-in/ConfigForm"
import { DeleteConfigDialog } from "#/components/check-in/DeleteConfigDialog"
import { UserStatesTable } from "#/components/check-in/UserStatesTable"
import { RewardsSection } from "#/components/check-in/RewardsSection"
import {
  useCheckInConfig,
  useCheckInUserStates,
  useUpdateCheckInConfig,
  useDeleteCheckInConfig,
} from "#/hooks/use-check-in"
import { ApiError } from "#/lib/api-client"


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

export const Route = createFileRoute("/_dashboard/check-in/$configId/")({
  component: CheckInDetailPage,
})

function CheckInDetailPage() {
  const { configId } = Route.useParams()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)

  const RESET_MODE_LABEL = getResetModeLabels()
  const WEEK_DAY_LABELS = getWeekDayLabels()

  const { data: config, isPending, error } = useCheckInConfig(configId)
  const { data: userStates, isPending: userStatesPending } =
    useCheckInUserStates(configId)
  const updateMutation = useUpdateCheckInConfig()
  const deleteMutation = useDeleteCheckInConfig()

  if (isPending) {
    return (
      <>
        <Header title={m.common_loading()} />
        <main className="flex h-40 items-center justify-center text-muted-foreground">
          {m.common_loading()}
        </main>
      </>
    )
  }

  if (error || !config) {
    return (
      <>
        <Header title="Error" />
        <main className="flex h-40 items-center justify-center text-destructive">
          {error?.message ?? "Config not found"}
        </main>
      </>
    )
  }

  return (
    <>
      <Header title={config.name} />

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/check-in">
                <ArrowLeft className="size-4" />
                {m.common_back()}
              </Link>
            </Button>
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
                    navigate({ to: "/check-in" })
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
              <ConfigForm
                defaultValues={{
                  name: config.name,
                  alias: config.alias,
                  description: config.description,
                  resetMode: config.resetMode,
                  weekStartsOn: config.weekStartsOn,
                  target: config.target,
                  timezone: config.timezone,
                  isActive: config.isActive,
                }}
                submitLabel={m.common_save_changes()}
                isPending={updateMutation.isPending}
                onSubmit={async (values) => {
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

          {/* Preview link */}
          {!editing && (
            <Button variant="outline" size="sm" asChild>
              <Link
                to="/check-in/$configId/preview"
                params={{ configId }}
              >
                <Play className="size-4" />
                {m.checkin_preview_test()}
              </Link>
            </Button>
          )}

          {/* Rewards */}
          {!editing && <RewardsSection configKey={configId} />}

          {/* User States (read-only) */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">{m.checkin_checkin_users()}</h3>
            {userStatesPending ? (
              <div className="flex h-24 items-center justify-center text-muted-foreground">
                {m.common_loading()}
              </div>
            ) : (
              <div className="rounded-xl border bg-card shadow-sm">
                <UserStatesTable data={userStates ?? []} />
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  )
}

function Header({ title }: { title: string }) {
  return (
    <header className="flex h-14 items-center gap-2 border-b px-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="mx-2 h-4" />
      <h1 className="text-sm font-semibold">{title}</h1>
    </header>
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
