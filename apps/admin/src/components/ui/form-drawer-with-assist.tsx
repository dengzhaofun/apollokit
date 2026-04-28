/**
 * Form drawer + collapsible AI assist side-panel.
 *
 * Layout strategy (per breakpoint):
 *   - md+ wide enough: side-by-side (form on the left, chat on the right
 *     when expanded). Sheet auto-grows to ~1180px.
 *   - md+ but assist collapsed: same Sheet at the standard `xl` width
 *     (840px), AI panel hidden, just a sparkle button in the header.
 *   - mobile: bottom Drawer with a Tabs switcher between Form / AI.
 *
 * Self-configuring AI: the caller passes the TanStack Form instance via
 * the `form` prop (already lifted out via `useXxxForm()`); we wrap it
 * in `<FormProvider>` so the embedded `<AIAssistPanel>` can read it
 * without prop drilling. The panel resolves its surface from the URL
 * and its apply tool from `MODULE_REGISTRY`.
 *
 * While this drawer is open, it also registers with `AssistContext` so
 * the global right-bottom FAB hides itself — no double AI entry on
 * screen at the same time.
 */

import { ChevronRightIcon, SparklesIcon } from "lucide-react"
import * as React from "react"
import { useDefaultLayout } from "react-resizable-panels"

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
import { Button } from "#/components/ui/button"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "#/components/ui/drawer"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "#/components/ui/resizable"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "#/components/ui/sheet"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "#/components/ui/tabs"
import { useIsMobile } from "#/hooks/use-mobile"
import { cn } from "#/lib/utils"
import * as m from "#/paraglide/messages.js"

import { AIAssistPanel } from "../admin-agent/AIAssistPanel"
import { useAssistContext } from "../admin-agent/AssistContext"
import { FormProvider, type AnyFormApi } from "../admin-agent/FormProvider"

interface FormDrawerWithAssistProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  /** When true, closing via overlay/Esc/X prompts a discard-changes confirm. */
  isDirty?: boolean
  /** TanStack Form instance powering the embedded form. The AI panel reads
   *  it via Context to inject `draft` and to call `setFieldValue` on apply. */
  form: AnyFormApi
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
}

const COLLAPSED_WIDTH = "sm:!max-w-[840px]"
// 给左右两栏 + 拖拽留出舒服空间;默认 58/42 split 时
// AI 栏 ≈ 1480 * 0.42 ≈ 621px(对比原 420px 固定宽)。
const EXPANDED_WIDTH = "sm:!max-w-[min(1480px,92vw)]"

export function FormDrawerWithAssist({
  open,
  onOpenChange,
  title,
  description,
  isDirty,
  form,
  children,
  footer,
  className,
}: FormDrawerWithAssistProps) {
  const isMobile = useIsMobile()
  const [confirmingClose, setConfirmingClose] = React.useState(false)
  const [assistOpen, setAssistOpen] = React.useState(false)

  // 持久化用户拖拽出来的左右比例 — useDefaultLayout 把 layout 存到
  // localStorage,key 由传入的 id 决定。SSR 阶段 window 不可用,这里
  // 保护一下;hook 内部对 storage===undefined 也是 no-op。
  const layoutStorage =
    typeof window !== "undefined" ? window.localStorage : undefined
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "form-drawer-assist-split-v1",
    storage: layoutStorage,
  })

  // Tell the global AssistContext we're on screen. The FAB watches this
  // counter and hides itself when > 0 to avoid two AI entry points.
  const { registerEmbedded } = useAssistContext()
  React.useEffect(() => {
    if (!open) return
    return registerEmbedded()
  }, [open, registerEmbedded])

  function requestClose(next: boolean) {
    if (next) {
      onOpenChange(true)
      return
    }
    if (isDirty) {
      setConfirmingClose(true)
      return
    }
    onOpenChange(false)
  }

  if (isMobile) {
    return (
      <FormProvider form={form}>
        <Drawer open={open} onOpenChange={requestClose}>
          <DrawerContent className={cn("flex max-h-[92vh] flex-col", className)}>
            <DrawerHeader className="border-b">
              <DrawerTitle>{title}</DrawerTitle>
              {description ? (
                <DrawerDescription>{description}</DrawerDescription>
              ) : null}
            </DrawerHeader>
            <Tabs defaultValue="form" className="flex flex-1 flex-col overflow-hidden">
              <TabsList className="mx-3 mt-2 grid w-[calc(100%-1.5rem)] grid-cols-2">
                <TabsTrigger value="form">表单</TabsTrigger>
                <TabsTrigger value="ai">
                  <SparklesIcon className="mr-1 size-3.5" />
                  AI 助手
                </TabsTrigger>
              </TabsList>
              <TabsContent value="form" className="flex-1 overflow-y-auto p-4 m-0">
                {children}
              </TabsContent>
              <TabsContent value="ai" className="flex-1 overflow-hidden m-0">
                <AIAssistPanel />
              </TabsContent>
            </Tabs>
            {footer ? (
              <div className="flex shrink-0 flex-col-reverse gap-2 border-t bg-muted/50 p-4 sm:flex-row sm:justify-end">
                {footer}
              </div>
            ) : null}
          </DrawerContent>
        </Drawer>
        <DiscardConfirm
          open={confirmingClose}
          onOpenChange={setConfirmingClose}
          onConfirm={() => onOpenChange(false)}
        />
      </FormProvider>
    )
  }

  return (
    <FormProvider form={form}>
      <Sheet open={open} onOpenChange={requestClose}>
        <SheetContent
          side="right"
          className={cn(
            "flex w-full flex-col gap-0 p-0 transition-[max-width] duration-200",
            assistOpen ? EXPANDED_WIDTH : COLLAPSED_WIDTH,
            className,
          )}
          // TODO(base-ui): 原 Radix Sheet 的 onPointerDownOutside /
          // onFocusOutside / onInteractOutside 阻止 ResizablePanelGroup
          // 中间 handle 拖动 / focus 被 Radix 误判为 outside-click → 关闭
          // Sheet。base-ui Dialog 没有等价 prop —— 当前先删，base-ui 默认
          // dismiss 行为可能本身已 OK；若 dev 复现关闭误触发，参照下面
          // 的 onOpenChange((open, event, reason) => ...) hook 处理：
          //   if (!open && reason === 'outside-press' && (event?.target as
          //     Element)?.closest('[data-slot=resizable-handle]')) return
        >
          <SheetHeader className="shrink-0 gap-1 border-b">
            <div className="flex items-center justify-between gap-2">
              <SheetTitle
                render={
                  <span className="font-heading text-base font-medium text-foreground">
                    {title}
                  </span>
                }
              />
              {/* mr-9 leaves room for Sheet's own close X (absolute top-3 right-3). */}
              <Button
                size="sm"
                variant={assistOpen ? "secondary" : "outline"}
                onClick={() => setAssistOpen((v) => !v)}
                className="mr-9 gap-1"
              >
                {assistOpen ? (
                  <ChevronRightIcon className="size-3.5" />
                ) : (
                  <SparklesIcon className="size-3.5" />
                )}
                <span className="text-xs">
                  {assistOpen ? "收起" : "AI 助手"}
                </span>
              </Button>
            </div>
            {description ? (
              <SheetDescription>{description}</SheetDescription>
            ) : null}
          </SheetHeader>
          <div className="flex flex-1 overflow-hidden">
            {assistOpen ? (
              <ResizablePanelGroup
                orientation="horizontal"
                defaultLayout={defaultLayout}
                onLayoutChanged={onLayoutChanged}
                className="flex-1"
              >
                <ResizablePanel defaultSize={58} minSize={35} maxSize={75}>
                  <div className="h-full overflow-y-auto p-4">{children}</div>
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={42} minSize={28} maxSize={65}>
                  <AIAssistPanel />
                </ResizablePanel>
              </ResizablePanelGroup>
            ) : (
              <div className="flex-1 overflow-y-auto p-4">{children}</div>
            )}
          </div>
          {footer ? (
            <div className="flex shrink-0 flex-col-reverse gap-2 border-t bg-muted/50 p-4 sm:flex-row sm:justify-end">
              {footer}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
      <DiscardConfirm
        open={confirmingClose}
        onOpenChange={setConfirmingClose}
        onConfirm={() => onOpenChange(false)}
      />
    </FormProvider>
  )
}

function DiscardConfirm({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onConfirm: () => void
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{m.common_discard_title()}</AlertDialogTitle>
          <AlertDialogDescription>
            {m.common_discard_description()}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{m.common_keep_editing()}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              onOpenChange(false)
              onConfirm()
            }}
          >
            {m.common_discard_changes()}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
