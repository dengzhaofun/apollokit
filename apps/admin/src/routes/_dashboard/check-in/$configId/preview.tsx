import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { format } from "date-fns"
import { Play, ArrowLeft, RotateCcw } from "lucide-react"
import { toast } from "sonner"
import { Link } from "@tanstack/react-router"

import { SidebarTrigger } from "#/components/ui/sidebar"
import { Separator } from "#/components/ui/separator"
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
          ? "Already checked in today"
          : result.justCompleted
            ? "Check-in successful — target completed!"
            : "Check-in successful!",
      )
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.body.error)
      } else {
        toast.error("Check-in failed")
      }
    }
  }

  if (isPending) {
    return (
      <>
        <Header configName="Loading..." configId="" />
        <main className="flex h-40 items-center justify-center text-muted-foreground">
          Loading...
        </main>
      </>
    )
  }

  if (error || !config) {
    return (
      <>
        <Header configName="Error" configId="" />
        <main className="flex h-40 items-center justify-center text-destructive">
          {error?.message ?? "Config not found"}
        </main>
      </>
    )
  }

  const latestResult = results[0] ?? null

  return (
    <>
      <Header configName={config.name} configId={configId} />

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
              <Badge variant="outline">Target: {config.target} days</Badge>
            )}
            <Badge variant={config.isActive ? "default" : "outline"}>
              {config.isActive ? "Active" : "Inactive"}
            </Badge>
            <span className="ml-auto text-xs text-muted-foreground">{config.timezone}</span>
          </div>

          {/* Test user & action */}
          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">Test User</h3>
                <p className="text-xs text-muted-foreground">
                  Using your admin account as the test end-user
                </p>
                <div className="mt-2 space-y-1">
                  <Row label="User ID" value={testUserId} mono />
                  <Row label="Name" value={session?.user.name ?? "—"} />
                  <Row label="Email" value={session?.user.email ?? "—"} />
                </div>
              </div>
              <Button
                size="lg"
                disabled={checkInMutation.isPending || !testUserId || !config.isActive}
                onClick={handleCheckIn}
              >
                <Play className="size-4" />
                {checkInMutation.isPending ? "Checking in..." : "Check In"}
              </Button>
            </div>
          </div>

          {/* Latest result */}
          {latestResult && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Latest Result</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setResults([])}
                >
                  <RotateCcw className="size-3" />
                  Clear
                </Button>
              </div>
              <div className="rounded-xl border bg-card p-6 shadow-sm">
                {latestResult.justCompleted && (
                  <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm font-medium text-green-700 dark:bg-green-950/30 dark:text-green-400">
                    Target just completed!
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-3">
                  <StatCard
                    label="Status"
                    value={
                      <Badge
                        variant={latestResult.alreadyCheckedIn ? "secondary" : "default"}
                      >
                        {latestResult.alreadyCheckedIn ? "Already checked in" : "New check-in"}
                      </Badge>
                    }
                  />
                  <StatCard label="Total Days" value={latestResult.state.totalDays} />
                  <StatCard label="Current Streak" value={latestResult.state.currentStreak} />
                  <StatCard label="Longest Streak" value={latestResult.state.longestStreak} />
                  <StatCard label="Cycle Days" value={latestResult.state.currentCycleDays} />
                  <StatCard
                    label="Target Progress"
                    value={
                      latestResult.target != null
                        ? `${latestResult.state.currentCycleDays} / ${latestResult.target}`
                        : "No target"
                    }
                  />
                  <StatCard
                    label="Completed"
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
                    label="Remaining"
                    value={latestResult.remaining != null ? `${latestResult.remaining} days` : "—"}
                  />
                  <StatCard
                    label="Cycle Key"
                    value={latestResult.state.currentCycleKey ?? "—"}
                  />
                </div>

                {/* Detailed state */}
                <div className="mt-4 rounded-lg border bg-muted/30 p-4">
                  <h4 className="mb-2 text-xs font-medium text-muted-foreground">
                    Full User State
                  </h4>
                  <div className="grid gap-2 text-xs sm:grid-cols-2">
                    <Row
                      label="Last Check-in Date"
                      value={latestResult.state.lastCheckInDate ?? "—"}
                    />
                    <Row
                      label="Last Check-in At"
                      value={
                        latestResult.state.lastCheckInAt
                          ? format(new Date(latestResult.state.lastCheckInAt), "yyyy-MM-dd HH:mm:ss")
                          : "—"
                      }
                    />
                    <Row
                      label="First Check-in At"
                      value={
                        latestResult.state.firstCheckInAt
                          ? format(new Date(latestResult.state.firstCheckInAt), "yyyy-MM-dd HH:mm:ss")
                          : "—"
                      }
                    />
                    <Row label="Config ID" value={latestResult.state.configId} mono />
                    <Row label="End User ID" value={latestResult.state.endUserId} mono />
                    <Row label="Organization ID" value={latestResult.state.organizationId} mono />
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
                      {r.alreadyCheckedIn ? "duplicate" : "new"}
                    </Badge>
                    <span>
                      Total: {r.state.totalDays} &middot; Streak: {r.state.currentStreak} &middot; Cycle: {r.state.currentCycleDays}
                    </span>
                    {r.justCompleted && (
                      <Badge className="ml-auto bg-green-600">completed</Badge>
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

const RESET_MODE_LABEL: Record<string, string> = {
  none: "None (cumulative)",
  week: "Weekly",
  month: "Monthly",
}

function Header({ configName, configId }: { configName: string; configId: string }) {
  return (
    <header className="flex h-14 items-center gap-2 border-b px-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="mx-2 h-4" />
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to="/check-in/$configId" params={{ configId }}>
          <ArrowLeft className="size-4" />
        </Link>
      </Button>
      <h1 className="text-sm font-semibold">Preview: {configName}</h1>
    </header>
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
