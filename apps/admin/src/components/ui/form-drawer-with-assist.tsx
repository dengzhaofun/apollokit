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
const EXPANDED_WIDTH = "sm:!max-w-[1180px]"

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
              <DrawerTitle asChild>
                <span className="font-heading text-base font-medium text-foreground">
                  {title}
                </span>
              </DrawerTitle>
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
        >
          <SheetHeader className="shrink-0 gap-1 border-b">
            <div className="flex items-center justify-between gap-2">
              <SheetTitle asChild>
                <span className="font-heading text-base font-medium text-foreground">
                  {title}
                </span>
              </SheetTitle>
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
            <div className="flex-1 overflow-y-auto p-4">{children}</div>
            {assistOpen ? (
              <div className="hidden w-[420px] shrink-0 border-l md:block">
                <AIAssistPanel />
              </div>
            ) : null}
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
