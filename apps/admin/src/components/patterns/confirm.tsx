import { useEffect, useRef, useState, type ReactNode } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "#/components/ui/alert-dialog"
import { cn } from "#/lib/utils"

/*
 * 命令式 confirm() —— 替代裸 window.confirm() 反 pattern。
 *
 * 调用:
 *   const ok = await confirm({
 *     title: "删除活动",
 *     description: `确定要删除 "${name}" 吗?此操作不可恢复。`,
 *     danger: true,
 *   })
 *   if (!ok) return
 *   await deleteMutation.mutateAsync(id)
 *
 * 原理:模块级 dispatch 函数,由 <ConfirmHost /> 在树里挂载并注入。
 * 必须在 providers 树内挂一次 ConfirmHost 才生效;mount 之前调用 confirm()
 * 会立刻 resolve(false)(降级到 deny,业务安全)。
 *
 * 为什么不用 useState + 局部 AlertDialog:那样每个调用点都要写 5-10 行模板,
 * 13 个模块 × 多个删除/确认操作 = 100+ 行重复代码。命令式 API 让调用点回归
 * "一行 if (!await confirm()) return"。
 */

export interface ConfirmInput {
  title: ReactNode
  description?: ReactNode
  /** 确认按钮文案,默认"确认" */
  confirmLabel?: ReactNode
  /** 取消按钮文案,默认"取消" */
  cancelLabel?: ReactNode
  /** 危险操作:确认按钮变红 */
  danger?: boolean
}

interface Pending {
  config: ConfirmInput
  resolve: (ok: boolean) => void
}

const dispatch: { fn?: (input: ConfirmInput) => Promise<boolean> } = {}

export function confirm(input: ConfirmInput): Promise<boolean> {
  if (!dispatch.fn) {
    // ConfirmHost 还没挂载 —— 业务安全起见返回 false(等价于"用户点取消")
    if (typeof window !== "undefined") {
      console.warn("[confirm] ConfirmHost not mounted; defaulting to deny")
    }
    return Promise.resolve(false)
  }
  return dispatch.fn(input)
}

export function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null)
  const resolverRef = useRef<((ok: boolean) => void) | null>(null)

  useEffect(() => {
    dispatch.fn = (input) =>
      new Promise<boolean>((resolve) => {
        resolverRef.current = resolve
        setPending({ config: input, resolve })
      })
    return () => {
      dispatch.fn = undefined
      // 卸载时若有未决定的 promise,降级 deny 避免泄漏
      resolverRef.current?.(false)
      resolverRef.current = null
    }
  }, [])

  const close = (ok: boolean) => {
    resolverRef.current?.(ok)
    resolverRef.current = null
    setPending(null)
  }

  if (!pending) return null

  const { config } = pending
  return (
    <AlertDialog open onOpenChange={(open) => !open && close(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{config.title}</AlertDialogTitle>
          {config.description && (
            <AlertDialogDescription>{config.description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => close(false)}>
            {config.cancelLabel ?? "取消"}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => close(true)}
            className={cn(
              config.danger &&
                "bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive/20",
            )}
          >
            {config.confirmLabel ?? "确认"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
