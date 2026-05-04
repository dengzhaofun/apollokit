import { Separator } from "#/components/ui/separator"
import { cn } from "#/lib/utils"
import type { ReactNode } from "react"

/**
 * 所有 settings 子页统一头部 — 标题(text-2xl) + 描述(muted) +
 * 右上角主操作槽 + 分隔线。
 *
 * 视觉对齐 Linear/Sentry settings:max-width 在 outer 容器决定,header 自适应,
 * 让每个 settings 页有一致的视觉节奏。
 */
interface Props {
  title: ReactNode
  description?: ReactNode
  /** 右上角主操作(按钮/链接)。 */
  action?: ReactNode
  className?: string
}

export function SettingsPageHeader({ title, description, action, className }: Props) {
  return (
    <header className={cn("space-y-3 pb-4", className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description ? (
            <p className="max-w-prose text-sm text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </div>
      <Separator className="opacity-60" />
    </header>
  )
}
