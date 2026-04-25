import { ArrowDownIcon, ArrowUpIcon, MinusIcon, type LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { Skeleton } from "#/components/ui/skeleton"
import { cn } from "#/lib/utils"

/*
 * 指标卡 —— 替代 dashboard.tsx 里散落的 PlaceholderKpiCard / RequestsKpiCard 等手写卡。
 * 一张卡 = 标签 + 数值 + delta + sparkline,Loading 走 skeleton,Error 走 dashed border
 * 提示但仍然占位(避免布局抖动)。
 *
 * 数值默认走 tabular-nums + JetBrains Mono 字体感(继承 var(--font-mono),前提是用
 * 了 .font-mono 工具类)。
 */

export interface DeltaInfo {
  /** 变化值,例如 12.4 表示 +12.4% */
  value: number
  /** delta 标签,如 "vs last week" / "本周新增" */
  label?: ReactNode
  /**
   * 视觉意图。default 时:up=绿、down=红。
   * 但有些指标"下降是好事"(如错误率),用 inverted 让 down=绿、up=红。
   */
  intent?: "default" | "inverted" | "neutral"
  /** 显式格式化,默认 +12.4% / -2.1%。覆盖时返回字符串即可。 */
  formatter?: (value: number) => string
}

export interface StatCardProps {
  label: ReactNode
  value: ReactNode
  /** label 前的小图标 */
  icon?: LucideIcon
  delta?: DeltaInfo
  /** sparkline 数据点 —— 任意长度,会等距 fit 到 svg。空数组不渲染。 */
  trend?: number[]
  /** sparkline 颜色,默认走 brand */
  trendColor?: string
  loading?: boolean
  /** 加载失败时,值显示 — 并给 dashed border 提示 */
  error?: boolean
  className?: string
  /**
   * 可选的右上角 hint(如 i18n badge 或 info tooltip 触发器)
   */
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
        "flex flex-col gap-1.5 rounded-lg border bg-card p-4 transition-colors hover:border-border-strong",
        error && "border-dashed border-border",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {Icon && <Icon className="size-3.5" aria-hidden />}
          <span>{label}</span>
        </div>
        {hint && <div className="shrink-0 text-muted-foreground">{hint}</div>}
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
      className={cn("mt-2 h-8 w-full", className)}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <path d={`M ${points}`} stroke={color} strokeWidth={1.5} fill="none" />
    </svg>
  )
}

/**
 * 4 列(默认)指标卡网格,响应式自动塌缩到 2 列 / 1 列。
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
  // 不能用 grid-cols-${var} 动态类(Tailwind JIT 会扫不到),手列出来
  const colClass = {
    1: "grid-cols-1",
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
    5: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-5",
  }[columns]

  return (
    <div className={cn("grid gap-3", colClass, className)}>{children}</div>
  )
}
