/**
 * 事件漏斗(Funnel)分析 —— 选 2-5 个事件作为步骤 + 转化窗口,跑 windowFunnel
 * 出每一步的留存数与转化率。
 *
 * 漏斗较重(每用户级别聚合),用按钮显式触发,不做输入即查的 onChange。
 */

import { createFileRoute } from "@tanstack/react-router"
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Plus,
  Trash2,
  Workflow,
} from "lucide-react"
import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts"

import {
  PageBody,
  PageHeader,
  PageSection,
  PageShell,
} from "#/components/patterns"
import { Button } from "#/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "#/components/ui/chart"
import { Input } from "#/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import { EventNameDatalist } from "#/components/analytics/EventNamePicker"
import { useTenantEventFunnel } from "#/lib/tinybird"
import * as m from "#/paraglide/messages.js"

const FUNNEL_LIST_ID = "funnel-step-options"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/analytics/funnel/")({
  component: FunnelPage,
})

type WindowOption = "24h" | "7d" | "30d"
const WINDOW_DAYS: Record<WindowOption, number> = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
}

function useWindow(option: WindowOption) {
  return useMemo(() => {
    const to = new Date()
    to.setMinutes(0, 0, 0)
    const from = new Date(to.getTime() - WINDOW_DAYS[option] * 86_400_000)
    return { from: from.toISOString(), to: to.toISOString() }
  }, [option])
}

type WindowUnit = "minute" | "hour" | "day"
const UNIT_SECONDS: Record<WindowUnit, number> = {
  minute: 60,
  hour: 3600,
  day: 86400,
}

const FUNNEL_CHART_CONFIG: ChartConfig = {
  users: { label: "Users", color: "var(--brand)" },
}

function FunnelPage() {
  return (
    <PageShell>
      <PageHeader
        icon={<Workflow className="size-5" />}
        title={m.analytics_funnel_title()}
        description={m.analytics_funnel_subtitle()}
      />
      <PageBody>
        <ClientOnly fallback={<SkeletonBlock tall />}>
          <FunnelInner />
        </ClientOnly>
      </PageBody>
    </PageShell>
  )
}

function FunnelInner() {
  const [windowOption, setWindowOption] = useState<WindowOption>("7d")
  const w = useWindow(windowOption)

  const [steps, setSteps] = useState<string[]>(["", ""])
  const [windowAmount, setWindowAmount] = useState(24)
  const [windowUnit, setWindowUnit] = useState<WindowUnit>("hour")

  // committed 状态 —— 用户点 "分析" 后才进 query
  const [submitted, setSubmitted] = useState<{
    steps: string[]
    windowSeconds: number
  } | null>(null)

  const funnelQuery = useTenantEventFunnel({
    steps: submitted?.steps ?? [""],
    windowSeconds: submitted?.windowSeconds ?? 86400,
    from: w.from,
    to: w.to,
    enabled: !!submitted,
  })

  const cleanedSteps = steps.map((s) => s.trim()).filter(Boolean)
  const stepCountOk = cleanedSteps.length >= 2 && cleanedSteps.length <= 5
  const windowTooLong = WINDOW_DAYS[windowOption] > 31

  const handleAdd = () => {
    if (steps.length >= 5) return
    setSteps((prev) => [...prev, ""])
  }
  const handleRemove = (idx: number) => {
    setSteps((prev) =>
      prev.length <= 2 ? prev : prev.filter((_, i) => i !== idx),
    )
  }
  const handleMove = (idx: number, dir: -1 | 1) => {
    setSteps((prev) => {
      const next = [...prev]
      const target = idx + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[idx], next[target]] = [next[target]!, next[idx]!]
      return next
    })
  }
  const handleSetStep = (idx: number, value: string) => {
    setSteps((prev) => prev.map((s, i) => (i === idx ? value : s)))
  }
  const handleAnalyze = () => {
    if (!stepCountOk || windowTooLong) return
    setSubmitted({
      steps: cleanedSteps,
      windowSeconds: windowAmount * UNIT_SECONDS[windowUnit],
    })
  }

  return (
    <>
      <PageSection>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {m.analytics_funnel_step_label({ n: 1 }).replace(/\d+$/, "")}
            </CardTitle>
            <CardDescription>{m.analytics_funnel_subtitle()}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 时间范围 */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Range
                </label>
                <Select
                  value={windowOption}
                  onValueChange={(v) => setWindowOption(v as WindowOption)}
                >
                  <SelectTrigger size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24h">24h</SelectItem>
                    <SelectItem value="7d">7d</SelectItem>
                    <SelectItem value="30d">30d</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">
                  {m.analytics_funnel_window_label()}
                </label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={1000}
                    value={windowAmount}
                    onChange={(e) =>
                      setWindowAmount(
                        Math.max(1, Math.min(1000, Number(e.target.value) || 1)),
                      )
                    }
                    className="h-8 w-20 font-mono text-xs"
                  />
                  <Select
                    value={windowUnit}
                    onValueChange={(v) => setWindowUnit(v as WindowUnit)}
                  >
                    <SelectTrigger size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minute">
                        {m.analytics_funnel_window_unit_minute()}
                      </SelectItem>
                      <SelectItem value="hour">
                        {m.analytics_funnel_window_unit_hour()}
                      </SelectItem>
                      <SelectItem value="day">
                        {m.analytics_funnel_window_unit_day()}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* 步骤编辑 */}
            <div className="space-y-2">
              {/* 所有 step 行共享一个 datalist —— 只渲染一次,避免重复请求 + 重复 DOM。 */}
              <EventNameDatalist
                listId={FUNNEL_LIST_ID}
                from={w.from}
                to={w.to}
              />
              {steps.map((step, idx) => (
                <StepRow
                  key={idx}
                  index={idx}
                  total={steps.length}
                  value={step}
                  onChange={(v) => handleSetStep(idx, v)}
                  onMove={(dir) => handleMove(idx, dir)}
                  onRemove={() => handleRemove(idx)}
                  listId={FUNNEL_LIST_ID}
                />
              ))}
              {steps.length < 5 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAdd}
                >
                  <Plus className="size-3.5" />
                  {m.analytics_funnel_add_step()}
                </Button>
              ) : null}
            </div>

            {windowTooLong ? (
              <p className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle className="size-3.5" />
                {m.analytics_funnel_window_too_long()}
              </p>
            ) : null}

            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                onClick={handleAnalyze}
                disabled={!stepCountOk || windowTooLong}
              >
                {m.analytics_funnel_run()}
              </Button>
              {!stepCountOk ? (
                <span className="text-xs text-muted-foreground">
                  {m.analytics_funnel_need_two_steps()}
                </span>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </PageSection>

      {/* 结果区 */}
      {submitted ? (
        <PageSection>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {m.analytics_funnel_chart_title()}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {funnelQuery.isError ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  {funnelQuery.error?.message ??
                    m.analytics_logs_fetch_failed()}
                </div>
              ) : funnelQuery.isLoading ? (
                <SkeletonBlock />
              ) : !funnelQuery.data || funnelQuery.data.data.length === 0 ? (
                <div className="flex h-40 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                  {m.analytics_funnel_empty()}
                </div>
              ) : (
                <FunnelResults
                  rows={funnelQuery.data.data}
                  steps={submitted.steps}
                />
              )}
            </CardContent>
          </Card>
        </PageSection>
      ) : null}
    </>
  )
}

function FunnelResults({
  rows,
  steps,
}: {
  rows: Array<{ step: number; users: number }>
  steps: string[]
}) {
  // pipe 已确保 step 升序;但保险起见排序一次
  const sorted = [...rows].sort((a, b) => a.step - b.step)

  // 转换成图表数据 + 转化率
  const firstUsers = Number(sorted[0]?.users || 0)
  const chartData = sorted.map((row, i) => {
    const users = Number(row.users || 0)
    const prev = i === 0 ? users : Number(sorted[i - 1]!.users || 0)
    const stepToStep = prev > 0 ? users / prev : 0
    const overall = firstUsers > 0 ? users / firstUsers : 0
    return {
      label: `${row.step}. ${steps[row.step - 1] ?? ""}`,
      step: row.step,
      event: steps[row.step - 1] ?? "",
      users,
      stepToStep,
      overall,
    }
  })

  return (
    <div className="space-y-4">
      <ChartContainer
        config={FUNNEL_CHART_CONFIG}
        className="aspect-[4/1] min-h-[200px] w-full"
      >
        <BarChart layout="vertical" data={chartData}>
          <CartesianGrid horizontal={false} strokeDasharray="3 3" />
          <XAxis type="number" tickLine={false} axisLine={false} />
          <YAxis
            type="category"
            dataKey="label"
            tickLine={false}
            axisLine={false}
            width={200}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar
            dataKey="users"
            fill="var(--color-users)"
            radius={[0, 4, 4, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ChartContainer>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                {m.analytics_funnel_table_step()}
              </TableHead>
              <TableHead>{m.analytics_funnel_table_event()}</TableHead>
              <TableHead className="text-right">
                {m.analytics_funnel_table_users()}
              </TableHead>
              <TableHead className="text-right">
                {m.analytics_funnel_table_step_to_step()}
              </TableHead>
              <TableHead className="text-right">
                {m.analytics_funnel_table_overall()}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {chartData.map((row) => (
              <TableRow key={row.step}>
                <TableCell className="font-mono text-xs tabular-nums">
                  {row.step}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {row.event}
                </TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums">
                  {row.users.toLocaleString()}
                </TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                  {(row.stepToStep * 100).toFixed(1)}%
                </TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                  {(row.overall * 100).toFixed(1)}%
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function StepRow({
  index,
  total,
  value,
  onChange,
  onMove,
  onRemove,
  listId,
}: {
  index: number
  total: number
  value: string
  onChange: (v: string) => void
  onMove: (dir: -1 | 1) => void
  onRemove: () => void
  listId: string
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 text-xs text-muted-foreground tabular-nums">
        {index + 1}.
      </span>
      <Input
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={m.analytics_funnel_step_placeholder()}
        className="h-8 flex-1 font-mono text-xs"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={index === 0}
        onClick={() => onMove(-1)}
        title={m.analytics_funnel_move_up()}
      >
        <ArrowUp className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={index === total - 1}
        onClick={() => onMove(1)}
        title={m.analytics_funnel_move_down()}
      >
        <ArrowDown className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={total <= 2}
        onClick={onRemove}
        title={m.analytics_funnel_remove_step()}
      >
        <Trash2 className="size-3.5 text-destructive" />
      </Button>
    </div>
  )
}

function SkeletonBlock({ tall }: { tall?: boolean }) {
  return (
    <div
      className={
        tall
          ? "flex h-80 w-full animate-pulse items-center justify-center rounded-md border border-dashed bg-muted/20 text-sm text-muted-foreground"
          : "flex h-40 w-full animate-pulse items-center justify-center rounded-md border border-dashed bg-muted/20 text-sm text-muted-foreground"
      }
    >
      …
    </div>
  )
}

function ClientOnly({
  children,
  fallback = null,
}: {
  children: ReactNode
  fallback?: ReactNode
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return <>{mounted ? children : fallback}</>
}
