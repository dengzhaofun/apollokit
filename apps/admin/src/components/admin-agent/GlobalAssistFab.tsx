/**
 * Right-bottom floating-action-button that opens the AI assist panel
 * for the **current** route surface.
 *
 * Hidden when:
 *   - The user is on a marketing/auth page (mounted only inside
 *     `_dashboard.tsx`, so this case is handled by mount placement).
 *   - A FormDrawerWithAssist is currently open — its embedded chat is
 *     the more contextual entry point. We watch `useAssistContext()`'s
 *     embeddedCount; when > 0, we hide.
 *
 * No FormProvider is in scope at this layer, so the panel reads
 * `form === null` from FormContext and just doesn't send a `draft`
 * field. That's the right behavior on a list/dashboard page.
 */

import { SparklesIcon, XIcon } from "lucide-react"
import * as React from "react"

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "#/components/ui/sheet"
import { Button } from "#/components/ui/button"
import { cn } from "#/lib/utils"

import { AIAssistPanel } from "./AIAssistPanel"
import { useAssistContext } from "./AssistContext"

export function GlobalAssistFab() {
  const [open, setOpen] = React.useState(false)
  const { embeddedCount } = useAssistContext()

  // Hide whenever a Drawer-embedded chat is on screen.
  if (embeddedCount > 0) return null

  return (
    <>
      <Button
        type="button"
        size="icon"
        aria-label="打开 AI 助手"
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-6 right-6 z-40 size-12 rounded-full shadow-lg",
          "bg-primary text-primary-foreground hover:bg-primary/90",
        )}
      >
        <SparklesIcon className="size-5" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="flex w-full flex-col gap-0 p-0 sm:!max-w-[480px]"
        >
          <SheetHeader className="shrink-0 gap-1 border-b">
            <div className="flex items-center justify-between gap-2">
              <SheetTitle
                render={
                  <span className="font-heading text-base font-medium text-foreground">
                    AI 助手
                  </span>
                }
              />
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => setOpen(false)}
                aria-label="关闭"
              >
                <XIcon className="size-4" />
              </Button>
            </div>
            <SheetDescription>
              问问题、查配置，或 @-提及资源让 AI 提议修改（你审核确认后写入）。要回填创建表单去对应模块。
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-hidden">
            <AIAssistPanel agentName="global-assistant" />
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
