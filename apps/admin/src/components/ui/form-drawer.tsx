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
import { useIsMobile } from "#/hooks/use-mobile"
import { cn } from "#/lib/utils"
import * as m from "#/paraglide/messages.js"

type FormDrawerSize = "md" | "lg" | "xl"

const SIZE_CLASS: Record<FormDrawerSize, string> = {
  md: "sm:!max-w-[480px]",
  lg: "sm:!max-w-[640px]",
  xl: "sm:!max-w-[840px]",
}

interface FormDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  /** When true, closing via overlay/Esc/X prompts a discard-changes confirm. */
  isDirty?: boolean
  /** Desktop drawer width token. Mobile always opens as a bottom sheet. */
  size?: FormDrawerSize
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
}

/**
 * Standardized container for **medium** create/edit forms (7–14 fields, 1–2
 * heavy controls, optional ≤2 tabs). Renders as a right-side `Sheet` on
 * desktop and a bottom `Drawer` (vaul) on `< 768px` so the form keeps the
 * list visible behind it as long as screen real estate permits.
 *
 * Like `FormDialog`, gates accidental close behind an AlertDialog when
 * `isDirty` is true. Designed to be driven by URL search params (see
 * `lib/modal-search.ts`).
 */
export function FormDrawer({
  open,
  onOpenChange,
  title,
  description,
  isDirty,
  size = "lg",
  children,
  footer,
  className,
}: FormDrawerProps) {
  const isMobile = useIsMobile()
  const [confirmingClose, setConfirmingClose] = React.useState(false)

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

  const body = (
    <div className="flex-1 overflow-y-auto p-4">{children}</div>
  )

  const footerNode = footer ? (
    <div className="flex shrink-0 flex-col-reverse gap-2 border-t bg-muted/50 p-4 sm:flex-row sm:justify-end">
      {footer}
    </div>
  ) : null

  return (
    <>
      {isMobile ? (
        <Drawer open={open} onOpenChange={requestClose}>
          <DrawerContent className={cn("flex max-h-[92vh] flex-col", className)}>
            <DrawerHeader className="border-b">
              <DrawerTitle>{title}</DrawerTitle>
              {description ? (
                <DrawerDescription>{description}</DrawerDescription>
              ) : null}
            </DrawerHeader>
            {body}
            {footerNode}
          </DrawerContent>
        </Drawer>
      ) : (
        <Sheet open={open} onOpenChange={requestClose}>
          <SheetContent
            side="right"
            className={cn(
              "flex w-full flex-col gap-0 p-0",
              SIZE_CLASS[size],
              className,
            )}
          >
            <SheetHeader className="shrink-0 gap-1 border-b">
              <SheetTitle
                render={
                  <span className="font-heading text-base font-medium text-foreground">
                    {title}
                  </span>
                }
              />
              {description ? (
                <SheetDescription>{description}</SheetDescription>
              ) : null}
            </SheetHeader>
            {body}
            {footerNode}
          </SheetContent>
        </Sheet>
      )}

      <AlertDialog open={confirmingClose} onOpenChange={setConfirmingClose}>
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
                setConfirmingClose(false)
                onOpenChange(false)
              }}
            >
              {m.common_discard_changes()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
