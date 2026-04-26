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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog"
import { cn } from "#/lib/utils"
import * as m from "#/paraglide/messages.js"

type FormDialogSize = "sm" | "md" | "lg"

const SIZE_CLASS: Record<FormDialogSize, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
}

interface FormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  /** When true, closing via overlay/Esc/X prompts a discard-changes confirm. */
  isDirty?: boolean
  size?: FormDialogSize
  /** Form body. Should NOT include its own submit button — pass that via `footer`. */
  children: React.ReactNode
  /** Sticky footer slot — typically Cancel + Submit buttons. */
  footer?: React.ReactNode
  className?: string
}

/**
 * Standardized container for **small** create/edit forms (≤6 fields, no heavy
 * controls). Wraps shadcn `Dialog` with a sticky header / scrollable body /
 * sticky footer layout, and gates accidental close behind an AlertDialog when
 * `isDirty` is true.
 *
 * Triggering is `open`-controlled — parents typically derive `open` from URL
 * search params (see `lib/modal-search.ts`) so the dialog state is shareable
 * and reacts to the browser back button.
 */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  isDirty,
  size = "md",
  children,
  footer,
  className,
}: FormDialogProps) {
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

  return (
    <>
      <Dialog open={open} onOpenChange={requestClose}>
        <DialogContent
          className={cn(
            "max-h-[85vh] gap-0 overflow-hidden p-0",
            SIZE_CLASS[size],
            className,
          )}
        >
          <DialogHeader className="border-b p-4">
            <DialogTitle>{title}</DialogTitle>
            {description ? (
              <DialogDescription>{description}</DialogDescription>
            ) : null}
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto p-4">{children}</div>
          {footer ? (
            <div className="flex flex-col-reverse gap-2 border-t bg-muted/50 p-4 sm:flex-row sm:justify-end">
              {footer}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

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
