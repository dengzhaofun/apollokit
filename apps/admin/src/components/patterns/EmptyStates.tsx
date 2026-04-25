import {
  AlertTriangleIcon,
  ConstructionIcon,
  InboxIcon,
  LockIcon,
  RefreshCwIcon,
  SearchXIcon,
} from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "#/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty"
import { cn } from "#/lib/utils"

/*
 * 预制空态库 —— 替代每页自己写 `<div>Loading...</div>` / `<div>Failed to load</div>`。
 * 全部基于 shadcn Empty 原语,自带 icon / title / description / 主操作 槽位。
 *
 * 用法:
 *   {isLoading ? <Skeleton/> : data.length === 0 ? <EmptyList .../> : <Table data={data}/>}
 *   {isError && <ErrorState onRetry={refetch} error={error} />}
 *
 * Phase 3 把这些铺到 activity / item / entity 等列表页。
 */

interface BaseProps {
  className?: string
  title?: ReactNode
  description?: ReactNode
  /** 主操作 —— 通常是 "新建" / "重试" / "返回" */
  action?: ReactNode
}

/**
 * 列表无数据 —— 集合本身是空的(如还没建活动)。
 * 默认文案中文,可覆盖。
 */
export function EmptyList({
  className,
  title = "暂无数据",
  description = "还没有任何记录,创建一个开始吧",
  action,
  icon,
}: BaseProps & { icon?: ReactNode }) {
  return (
    <Empty className={cn("border", className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          {icon ?? <InboxIcon className="size-4" />}
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  )
}

/**
 * 搜索 / 筛选 之后无匹配 —— 区别于 EmptyList,这里有 query / 筛选条件。
 * 通常配 onClear 让用户清除筛选回到全量列表。
 */
export function EmptySearch({
  className,
  query,
  title = "没有匹配的结果",
  description,
  onClear,
  clearLabel = "清除筛选",
}: Omit<BaseProps, "action"> & {
  query?: string
  onClear?: () => void
  clearLabel?: string
}) {
  return (
    <Empty className={cn("border", className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchXIcon className="size-4" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>
          {description ??
            (query
              ? `当前没有匹配 "${query}" 的记录。试试别的关键词或清除筛选。`
              : "调整一下筛选条件再试。")}
        </EmptyDescription>
      </EmptyHeader>
      {onClear && (
        <EmptyContent>
          <Button variant="outline" size="sm" onClick={onClear}>
            {clearLabel}
          </Button>
        </EmptyContent>
      )}
    </Empty>
  )
}

/**
 * 加载失败 —— 替代 dashboard 里把原始 error.message dump 出来的反 pattern。
 * 默认折叠 details 给开发者看技术细节,前台用户看到的是友好文案。
 */
export function ErrorState({
  className,
  title = "加载失败",
  description = "请稍后重试。如果一直失败,请联系管理员。",
  onRetry,
  retryLabel = "重试",
  /** 真实 Error,折叠展示 message + stack 给开发者排查 */
  error,
}: BaseProps & {
  onRetry?: () => void
  retryLabel?: string
  error?: Error | null | unknown
}) {
  return (
    <Empty
      className={cn(
        "border border-dashed bg-destructive/[0.03]",
        className
      )}
    >
      <EmptyHeader>
        <EmptyMedia variant="icon" className="bg-destructive/10 text-destructive">
          <AlertTriangleIcon className="size-4" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {(onRetry || error != null) && (
        <EmptyContent>
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RefreshCwIcon />
              {retryLabel}
            </Button>
          )}
          {error instanceof Error && (
            <details className="w-full max-w-sm text-left">
              <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
                技术细节 · Technical details
              </summary>
              <pre className="mt-1 max-h-32 overflow-auto rounded bg-muted/40 p-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
                {String(error.message)}
              </pre>
            </details>
          )}
        </EmptyContent>
      )}
    </Empty>
  )
}

/**
 * 未授权 / 角色不够 —— 用 lock icon 区分于 not-found。
 * action 通常是 "返回 dashboard" 或 "联系管理员"。
 */
export function UnauthorizedState({
  className,
  title = "无访问权限",
  description = "你的账号目前没有进入这个页面的权限。请联系管理员授权,或返回主页。",
  action,
}: BaseProps) {
  return (
    <Empty className={cn("border", className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon" className="bg-warning/10 text-warning">
          <LockIcon className="size-4" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  )
}

/**
 * 功能未上线 —— 给 sidebar 里挂着但还没开发完的 placeholder 路由用。
 */
export function ComingSoon({
  className,
  title = "敬请期待",
  description = "这个功能正在开发中,会在后续版本上线。",
  action,
}: BaseProps) {
  return (
    <Empty className={cn("border", className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon" className="bg-info/10 text-info">
          <ConstructionIcon className="size-4" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  )
}
