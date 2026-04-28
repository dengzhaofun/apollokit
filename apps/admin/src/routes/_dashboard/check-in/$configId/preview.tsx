import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { format } from "date-fns"
import { Play, ArrowLeft, RotateCcw } from "lucide-react"
import { toast } from "sonner"
import { Link } from "@tanstack/react-router"

import * as m from "#/paraglide/messages.js"
import { PageHeaderActions } from "#/components/PageHeader"
import { Button } from "#/components/ui/button"
import { Badge } from "#/components/ui/badge"
import {
  useCheckInConfig,
  usePerformCheckIn,
} from "#/hooks/use-check-in"
import { authClient } from "#/lib/auth-client"
import { ApiError } from "#/lib/api-client"
import type { CheckInResult } from "#/lib/types/check-in"

export const Route = createFileRoute("/_dashboard/check-in/$configId/preview")({
  component: CheckInPreviewPage,
})

function CheckInPreviewPage() {
  const { configId } = Route.useParams()
  const RESET_MODE_LABEL = getResetModeLabels()
  const { data: session } = authClient.useSession()
  const { data: config, isPending, error } = useCheckInConfig(configId)
  const checkInMutation = usePerformCheckIn()
  const [results, setResults] = useState<CheckInResult[]>([])

  const testUserId = session?.user.id ?? ""

  async function handleCheckIn() {
    if (!testUserId) return
    try {
      const result = await checkInMutation.mutateAsync({
        configKey: configId,
        endUserId: testUserId,
      })
      setResults((prev) => [result, ...prev])
      toast.success(
        result.alreadyCheckedIn
          ? m.checkin_already_checked_in_today()
          : result.justCompleted
            ? m.checkin_checkin_target_completed()
            : m.checkin_checkin_successful(),
      )
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.body.error)
      } else {
        toast.error(m.checkin_checkin_failed())
      }
    }
  }

  if (isPending) {
    return (
      <>
        <Header configId="" />
        <main className="flex h-40 items-center justify-center text-muted-foreground">
          {m.common_loading()}
        </main>
      </>
    )
  }

  if (error || !config) {
    return (
      <>
        <Header configId="" />
        <main className="flex h-40 items-center justify-center text-destructive">
          {error?.message ?? "Config not found"}
        </main>
      </>
    )
  }

  const latestResult = results[0] ?? null

  return (
    <>
      <Header configId={configId} />

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {/* Config summary bar */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-4 py-3 shadow-sm">
            <span className="text-sm font-medium">{config.name}</span>
            {config.alias && (
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{config.alias}</code>
            )}
            <Badge variant="secondary">{RESET_MODE_LABEL[config.resetMode]}</Badge>
            {config.target != null && (
              <Badge variant="outline">{m.checkin_target()}: {config.target} {m.checkin_days()}</Badge>
            )}
            <Badge variant={config.isActive ? "default" : "outline"}>
              {config.isActive ? m.common_active() : m.common_inactive()}
            </Badge>
            <span className="ml-auto text-xs text-muted-foreground">{config.timezone}</span>
          </div>

          {/* Test user & action */}
          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">{m.checkin_test_user()}</h3>
                <p className="text-xs text-muted-foreground">
                  {m.checkin_test_user_desc()}
                </p>
                <div className="mt-2 space-y-1">
                  <Row label={m.checkin_user_id()} value={testUserId} mono />
                  <Row label={m.common_name()} value={session?.user.name ?? "—"} />
                  <Row label={m.checkin_email()} value={session?.user.email ?? "—"} />
                </div>
              </div>
              <Button
                size="lg"
                disabled={checkInMutation.isPending || !testUserId || !config.isActive}
                onClick={handleCheckIn}
              >
                <Play className="size-4" />
                {checkInMutation.isPending ? m.checkin_checking_in() : m.checkin_check_in()}
              </Button>
            </div>
          </div>

          {/* Latest result */}
          {latestResult && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">{m.checkin_latest_result()}</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setResults([])}
                >
                  <RotateCcw className="size-3" />
                  {m.checkin_clear()}
                </Button>
              </div>
              <div className="rounded-xl border bg-card p-6 shadow-sm">
                {latestResult.justCompleted && (
                  <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm font-medium text-green-700 dark:bg-green-950/30 dark:text-green-400">
                    {m.checkin_target_just_completed()}
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-3">
                  <StatCard
                    label={m.common_status()}
                    value={
                      <Badge
                        variant={latestResult.alreadyCheckedIn ? "secondary" : "default"}
                      >
                        {latestResult.alreadyCheckedIn ? m.checkin_already_checked_in() : m.checkin_new_checkin()}
                      </Badge>
                    }
                  />
                  <StatCard label={m.checkin_total_days()} value={latestResult.state.totalDays} />
                  <StatCard label={m.checkin_current_streak()} value={latestResult.state.currentStreak} />
                  <StatCard label={m.checkin_longest_streak()} value={latestResult.state.longestStreak} />
                  <StatCard label={m.checkin_cycle_days()} value={latestResult.state.currentCycleDays} />
                  <StatCard
                    label={m.checkin_target_progress()}
                    value={
                      latestResult.target != null
                        ? `${latestResult.state.currentCycleDays} / ${latestResult.target}`
                        : m.checkin_no_target()
                    }
                  />
                  <StatCard
                    label={m.checkin_completed()}
                    value={
                      latestResult.target != null ? (
                        <Badge variant={latestResult.isCompleted ? "default" : "outline"}>
                          {latestResult.isCompleted ? "Yes" : "No"}
                        </Badge>
                      ) : (
                        "—"
                      )
                    }
                  />
                  <StatCard
                    label={m.checkin_remaining()}
                    value={latestResult.remaining != null ? `${latestResult.remaining} ${m.checkin_days()}` : "—"}
                  />
                  <StatCard
                    label={m.checkin_cycle_key()}
                    value={latestResult.state.currentCycleKey ?? "—"}
                  />
                </div>

                {/* Detailed state */}
                <div className="mt-4 rounded-lg border bg-muted/30 p-4">
                  <h4 className="mb-2 text-xs font-medium text-muted-foreground">
                    {m.checkin_full_user_state()}
                  </h4>
                  <div className="grid gap-2 text-xs sm:grid-cols-2">
                    <Row
                      label={m.checkin_last_checkin_date()}
                      value={latestResult.state.lastCheckInDate ?? "—"}
                    />
                    <Row
                      label={m.checkin_last_checkin_at()}
                      value={
                        latestResult.state.lastCheckInAt
                          ? format(new Date(latestResult.state.lastCheckInAt), "yyyy-MM-dd HH:mm:ss")
                          : "—"
                      }
                    />
                    <Row
                      label={m.checkin_first_checkin_at()}
                      value={
                        latestResult.state.firstCheckInAt
                          ? format(new Date(latestResult.state.firstCheckInAt), "yyyy-MM-dd HH:mm:ss")
                          : "—"
                      }
                    />
                    <Row label={m.checkin_config_id()} value={latestResult.state.configId} mono />
                    <Row label={m.checkin_end_user_id()} value={latestResult.state.endUserId} mono />
                    <Row label={m.checkin_project_id()} value={latestResult.state.organizationId} mono />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* History */}
          {results.length > 1 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">
                History ({results.length} calls)
              </h3>
              <div className="space-y-2">
                {results.slice(1).map((r, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-4 rounded-lg border bg-card px-4 py-3 text-sm"
                  >
                    <Badge
                      variant={r.alreadyCheckedIn ? "secondary" : "default"}
                      className="shrink-0"
                    >
                      {r.alreadyCheckedIn ? m.checkin_duplicate() : m.checkin_new()}
                    </Badge>
                    <span>
                      Total: {r.state.totalDays} &middot; Streak: {r.state.currentStreak} &middot; Cycle: {r.state.currentCycleDays}
                    </span>
                    {r.justCompleted && (
                      <Badge className="ml-auto bg-green-600">{m.checkin_completed()}</Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  )
}

function getResetModeLabels(): Record<string, string> {
  return {
    none: m.checkin_reset_none(),
    week: m.checkin_reset_weekly(),
    month: m.checkin_reset_monthly(),
  }
}

function Header({ configId }: { configId: string }) {
  return (
    <PageHeaderActions>
      <Button
        render={
          <Link to="/check-in/$configId" params={{ configId }}>
            <ArrowLeft className="size-4" />
          </Link>
        }
        variant="ghost" size="sm" className="-ml-2"
      />
    </PageHeaderActions>
  )
}

function StatCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  )
}

function Row({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono text-xs" : ""}>{value}</span>
    </div>
  )
}
