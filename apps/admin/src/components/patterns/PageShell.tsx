import type { ReactNode } from "react"

import { Badge } from "#/components/ui/badge"
import { cn } from "#/lib/utils"

/*
 * 页面骨架 —— 替代每个 route 自己写 main + 自己摆 title/desc/actions 的散乱模式。
 *
 *   <PageShell>
 *     <PageHeader title="…" description="…" actions={<Button …/>} />
 *     <PageBody>
 *       <PageSection title="…">…</PageSection>
 *     </PageBody>
 *   </PageShell>
 *
 * - 不接管 _dashboard.tsx 的 sticky topbar(SidebarTrigger/全局 breadcrumb 仍在那)
 * - PageHeader 是页内大标题块,负责给页面定调,_dashboard topbar 是壳层导航
 * - 没有 portal 魔法,actions 直接放在 PageHeader 里渲染
 */

export function PageShell({
  children,
  className,
  contentClassName,
}: {
  children: ReactNode
  className?: string
  /** 内容容器 class —— 调 max-width / padding 可以覆盖 */
  contentClassName?: string
}) {
  return (
    <main className={cn("flex flex-1 flex-col", className)}>
      <div
        className={cn(
          "mx-auto flex w-full max-w-screen-2xl flex-1 flex-col gap-6 p-6 md:px-8 md:py-7",
          contentClassName
        )}
      >
        {children}
      </div>
    </main>
  )
}

export interface PageHeaderProps {
  /** 主标题(h1)。中英混排时:`数据大盘 · Overview` 这种最稳 */
  title: ReactNode
  /** 副标题 / 描述,通常一句话说清这个页面是干嘛的 */
  description?: ReactNode
  /** 标题后挂的小 badge,例如 "Beta" / "12 active" */
  badge?: ReactNode
  /** 标题前挂的图标徽章(40×40 圆角带 brand-soft 底,A 方向签名细节)*/
  icon?: ReactNode
  /** 右侧 actions —— 一组按钮 */
  actions?: ReactNode
  /** 标题块下方的 tabs —— 详情页常用 */
  tabs?: ReactNode
  className?: string
}

export function PageHeader({
  title,
  description,
  badge,
  icon,
  actions,
  tabs,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-4", className)}>
      {/*
       * 桌面 sm+:title block + actions 横排,actions 靠右
       * 移动端 <sm:title block 在上,actions 在下,允许 actions 换行 wrap
       *
       * 不要给 h1 加 truncate —— 移动端窄屏让标题完整可读;桌面 sm+ 才需要
       * truncate 防超长名字撑破 layout(name 跟 status badge 同行)。
       */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {icon && (
            <div
              className="flex size-10 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand"
              aria-hidden
            >
              {icon}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl/tight font-semibold tracking-tight sm:truncate sm:text-2xl/tight">
                {title}
              </h1>
              {badge &&
                (typeof badge === "string" ? (
                  <Badge variant="secondary" className="shrink-0">
                    {badge}
                  </Badge>
                ) : (
                  <span className="shrink-0">{badge}</span>
                ))}
            </div>
            {description && (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
            {actions}
          </div>
        )}
      </div>
      {tabs && <div className="-mb-px overflow-x-auto">{tabs}</div>}
    </header>
  )
}

/**
 * 页面正文容器,负责 section 之间的统一间距。其实就是个 flex-col gap-6 的语义化包装。
 */
export function PageBody({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-1 flex-col gap-6", className)}>{children}</div>
  )
}

/**
 * 页面内的 section,带可选标题/描述/actions 的小卡。子内容自带 gap。
 *
 * 不要嵌套 PageSection —— 一层就够,层级太深视觉会乱。
 */
export function PageSection({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      {(title || description || actions) && (
        <div className="flex items-end justify-between gap-3">
          <div>
            {title && <h2 className="text-base font-semibold">{title}</h2>}
            {description && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          {actions && (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          )}
        </div>
      )}
      {children}
    </section>
  )
}
