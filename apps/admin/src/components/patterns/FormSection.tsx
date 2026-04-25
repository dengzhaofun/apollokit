import type { ReactNode } from "react"

import { cn } from "#/lib/utils"

/*
 * FormSection —— 长表单切分,每段一个语义分组。比起 ActivityForm 之前 414 行
 * 一锅端,拆成 5-6 个 section 让用户能扫式找到自己关心的字段。
 *
 *   <FormSection title="基本信息" description="活动的展示文案 + alias">
 *     <FormGrid cols={2}>
 *       <Field>...</Field>
 *       <Field>...</Field>
 *     </FormGrid>
 *   </FormSection>
 *
 * 视觉:section 之间是 30+ px gap + 顶部一条 border,标题/描述左对齐,字段网格在
 * 标题下方。section 内部用 FormGrid 控制每行字段数。
 */

export function FormSection({
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
    <section className={cn("flex flex-col gap-4 pb-6", className)}>
      {(title || description || actions) && (
        <div className="flex items-end justify-between gap-3 border-b pb-3">
          <div>
            {title && (
              <h3 className="text-base font-semibold tracking-tight">{title}</h3>
            )}
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
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  )
}

/**
 * FormGrid —— section 内的字段网格,1/2/3 列响应式。响应式断点:
 * 1: 全屏始终 1 列
 * 2: <md 1 列,>=md 2 列
 * 3: <md 1 列,md 2 列,>=lg 3 列
 *
 * 对 JsonEditor / 长 textarea 这种"占整行"字段,可以用 col-span-full 跨满。
 */
export function FormGrid({
  cols = 2,
  children,
  className,
}: {
  cols?: 1 | 2 | 3
  children: ReactNode
  className?: string
}) {
  const colClass = {
    1: "grid-cols-1",
    2: "grid-cols-1 md:grid-cols-2",
    3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
  }[cols]
  return <div className={cn("grid gap-4", colClass, className)}>{children}</div>
}
