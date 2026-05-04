import { ArrowDownIcon, ArrowUpIcon, MinusIcon, type LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { Card, CardContent } from "#/components/ui/card"
import { StatusBadge, type StatusValue } from "#/components/ui/status-badge"
import { Skeleton } from "#/components/ui/skeleton"
import { cn } from "#/lib/utils"

/*
 * 指标卡 —— 标签 + 数值 + delta + sparkline，Loading 走 skeleton，Error 走 dashed border
 *
 * icon 现在渲染为彩色方块徽章（brand-soft 底 + brand 色图标），与 FlowAI / Org Overview
 * 页本地 StatCard 的风格对齐，视觉层次更清晰。
 */

export interface DeltaInfo {
  value: number
  label?: ReactNode
  intent?: "default" | "inverted" | "neutral"
  formatter?: (value: number) => string
}

export interface StatCardProps {
  label: ReactNode
  value: ReactNode
  icon?: LucideIcon
  delta?: DeltaInfo
  trend?: number[]
  trendColor?: string
  loading?: boolean
  error?: boolean
  className?: string
  hint?: ReactNode
}

export function StatCard({
  label,
  value,
  icon: Icon,
  delta,
  trend,
  trendColor,
  loading,
  error,
  className,
  hint,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-[0_1px_3px_oklch(0_0_0/0.06),0_0_0_1px_oklch(0_0_0/0.07)] dark:shadow-[0_1px_4px_oklch(0_0_0/0.35),0_0_0_1px_oklch(1_0_0/0.08)] transition-colors hover:border-border-strong",
        error && "border-dashed border-border",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          {Icon && (
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand">
              <Icon className="size-4" aria-hidden />
            </div>
          )}
          <span className="truncate text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
        </div>
        {hint && (
          <div className="ml-auto max-w-[55%] shrink-0 truncate text-right text-muted-foreground">
            {hint}
          </div>
        )}
      </div>

      <div className="text-3xl font-semibold leading-tight tabular-nums tracking-tight">
        {loading ? (
          <Skeleton className="my-1 h-8 w-24" />
        ) : error ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          value
        )}
      </div>

      {delta && !loading && !error && <DeltaRow delta={delta} />}

      {trend && trend.length > 1 && !loading && !error && (
        <Sparkline values={trend} color={trendColor ?? "var(--brand)"} />
      )}
    </div>
  )
}

function DeltaRow({ delta }: { delta: DeltaInfo }) {
  const intent = delta.intent ?? "default"
  const direction =
    delta.value > 0 ? "up" : delta.value < 0 ? "down" : "neutral"
  const positive =
    intent === "neutral"
      ? false
      : intent === "inverted"
        ? direction === "down"
        : direction === "up"
  const negative =
    intent === "neutral"
      ? false
      : intent === "inverted"
        ? direction === "up"
        : direction === "down"

  const Arrow =
    direction === "up" ? ArrowUpIcon : direction === "down" ? ArrowDownIcon : MinusIcon

  const formatted =
    delta.formatter?.(delta.value) ??
    `${delta.value > 0 ? "+" : ""}${delta.value.toFixed(1)}%`

  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span
        className={cn(
          "inline-flex items-center gap-0.5 font-medium tabular-nums",
          positive && "text-success",
          negative && "text-destructive",
          intent === "neutral" && "text-muted-foreground"
        )}
      >
        <Arrow className="size-3" aria-hidden />
        {formatted}
      </span>
      {delta.label && (
        <span className="text-muted-foreground">{delta.label}</span>
      )}
    </div>
  )
}

function Sparkline({
  values,
  color,
  className,
}: {
  values: number[]
  color: string
  className?: string
}) {
  const W = 200
  const H = 32
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const stepX = W / (values.length - 1)
  const points = values
    .map((v, i) => {
      const x = i * stepX
      const y = H - ((v - min) / range) * H
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(" L ")

  return (
    <svg
      className={cn("mt-1 h-8 w-full", className)}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <path d={`M ${points}`} stroke={color} strokeWidth={1.5} fill="none" />
    </svg>
  )
}

/**
 * 4 列（默认）指标卡网格，响应式自动塌缩到 2 列 / 1 列。
 */
export function StatGrid({
  children,
  columns = 4,
  className,
}: {
  children: ReactNode
  columns?: 1 | 2 | 3 | 4 | 5
  className?: string
}) {
  const colClass = {
    1: "grid-cols-1",
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4",
    5: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5",
  }[columns]

  return (
    <div className={cn("grid gap-3", colClass, className)}>{children}</div>
  )
}

/* ─── DistributionCard ─────────────────────────────────────────────────────── */

export interface DistributionItem {
  color: StatusValue
  label: string
  count: number
  pct: number
}

export interface DistributionCardProps {
  title: ReactNode
  items: DistributionItem[]
  loading?: boolean
  className?: string
  /** 可选右上角操作（如齿轮图标） */
  action?: ReactNode
}

/**
 * 分布统计卡 —— Member Status / Role Distribution 等场景。
 * 每行: 彩色圆点 + 标签 + 数量 + 百分比。
 */
export function DistributionCard({
  title,
  items,
  loading,
  className,
  action,
}: DistributionCardProps) {
  return (
    <Card className={cn("", className)}>
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium">{title}</span>
          {action}
        </div>
        <div className="flex flex-col gap-2">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))
            : items.map((item) => (
                <div key={item.label} className="flex items-center gap-2 text-sm">
                  <StatusBadge status={item.color} label={item.label} className="flex-1 min-w-0" />
                  <span className="shrink-0 tabular-nums font-medium">
                    {String(item.count).padStart(2, "0")}
                  </span>
                  <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {item.pct}%
                  </span>
                </div>
              ))}
        </div>
      </CardContent>
    </Card>
  )
}

/* ─── QuickStatRow ─────────────────────────────────────────────────────────── */

export interface QuickStat {
  label: string
  value: ReactNode
  loading?: boolean
}

export interface QuickStatRowProps {
  stats: QuickStat[]
  className?: string
}

/**
 * 4 格扁平速览统计行 —— 用于列表页顶部（Total / Active / Pending / Seats 等）。
 * 直接用 Card 容器，视觉上和下方表格形成层次。
 */
export function QuickStatRow({ stats, className }: QuickStatRowProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 sm:grid-cols-4",
        className
      )}
    >
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {stat.label}
            </p>
            <div className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
              {stat.loading ? <Skeleton className="h-7 w-16" /> : stat.value}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
