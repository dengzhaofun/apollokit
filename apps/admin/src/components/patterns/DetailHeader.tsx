import type { ReactNode } from "react"

import { cn } from "#/lib/utils"

/*
 * 详情页头 —— 替代 activity/$alias/index.tsx 等手写 400+ 行的散落 title/breadcrumb/badge/actions。
 *
 *   <DetailHeader
 *     icon={<StarIcon className="size-5" />}
 *     title="春节限定礼包活动"
 *     subtitle="spring-2026-pack"
 *     status={<Badge>Active · 进行中</Badge>}
 *     meta={[
 *       { icon: <CalendarIcon/>, label: "02-08 ~ 02-22 · 14 天" },
 *       { icon: <UserIcon/>, label: "创建人 Samuel" },
 *     ]}
 *     actions={<><Button>Duplicate</Button><Button>Edit</Button></>}
 *   />
 *
 * subtitle 通常是 alias / id / SKU 等技术 id,用 mono 字体 + muted 配色。
 */

export interface MetaItem {
  /** 12px 灰色 icon */
  icon?: ReactNode
  label: ReactNode
  /** 可选,key 名(如 "Created by"),默认不显示 */
  key?: ReactNode
}

export interface DetailHeaderProps {
  /** 左侧 40-48px 圆角图标徽章,A 方向用 brand-soft 底 */
  icon?: ReactNode
  title: ReactNode
  /** 通常是 alias / id,会用 mono pill 样式 */
  subtitle?: ReactNode
  /** 主标题旁的状态 badge,通常用 shadcn <Badge> */
  status?: ReactNode
  meta?: MetaItem[]
  actions?: ReactNode
  className?: string
}

export function DetailHeader({
  icon,
  title,
  subtitle,
  status,
  meta,
  actions,
  className,
}: DetailHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          {icon && (
            <div
              className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand"
              aria-hidden
            >
              {icon}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl/tight font-semibold tracking-tight">
                {title}
              </h1>
              {subtitle && (
                <span className="rounded-md border bg-muted/40 px-2 py-0.5 font-mono text-xs text-muted-foreground">
                  {subtitle}
                </span>
              )}
              {status && <span className="shrink-0">{status}</span>}
            </div>
            {meta && meta.length > 0 && (
              <ul className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {meta.map((m, i) => (
                  <li key={i} className="inline-flex items-center gap-1.5">
                    {m.icon && (
                      <span className="text-muted-foreground/80 [&_svg]:size-3.5">
                        {m.icon}
                      </span>
                    )}
                    {m.key && <span className="font-medium">{m.key}:</span>}
                    <span>{m.label}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        )}
      </div>
    </header>
  )
}

/**
 * 详情页两栏布局 —— 主体在左(2/3),metadata 侧栏在右(1/3)。
 * 移动端自动塌缩成一列,侧栏放主体上方(优先看 status / actions)。
 *
 *   <DetailLayout
 *     side={<><StatusCard/><CreatedByCard/><LinkedResourcesCard/></>}
 *   >
 *     <Tabs>...</Tabs>
 *     <ConfigTable/>
 *   </DetailLayout>
 */
export function DetailLayout({
  children,
  side,
  className,
}: {
  children: ReactNode
  side?: ReactNode
  className?: string
}) {
  if (!side) {
    return <div className={cn("flex flex-col gap-4", className)}>{children}</div>
  }
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px] lg:items-start",
        className
      )}
    >
      <div className="flex min-w-0 flex-col gap-4 lg:order-1">{children}</div>
      <aside className="flex flex-col gap-4 lg:order-2">{side}</aside>
    </div>
  )
}
