import { ArrowUpIcon, SquareIcon } from "lucide-react"
import * as React from "react"

import { Button } from "#/components/ui/button"
import { Textarea } from "#/components/ui/textarea"
import { cn } from "#/lib/utils"

export function PromptInput({
  onSubmit,
  onStop,
  disabled,
  isStreaming,
  placeholder = "描述你想要的配置 ...",
  className,
}: {
  onSubmit: (text: string) => void
  /** Called when the user clicks the stop button while a response is streaming. */
  onStop?: () => void
  /** Disable input + submit (separate from streaming — e.g. while pending auth). */
  disabled?: boolean
  /** Streaming in progress. Submit becomes Stop. */
  isStreaming?: boolean
  placeholder?: string
  className?: string
}) {
  const [value, setValue] = React.useState("")
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null)

  function submit() {
    const trimmed = value.trim()
    if (!trimmed) return
    onSubmit(trimmed)
    setValue("")
    // Restore focus so the user can keep typing follow-ups.
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter to send, Shift+Enter for newline (chat-app convention).
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className={cn("flex shrink-0 items-end gap-2 border-t bg-background p-3", className)}
    >
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        className="min-h-[40px] max-h-[120px] resize-none"
      />
      {isStreaming ? (
        <Button
          type="button"
          size="icon"
          variant="secondary"
          onClick={onStop}
          aria-label="停止生成"
        >
          <SquareIcon className="size-4" />
        </Button>
      ) : (
        <Button
          type="submit"
          size="icon"
          disabled={disabled || !value.trim()}
          aria-label="发送"
        >
          <ArrowUpIcon className="size-4" />
        </Button>
      )}
    </form>
  )
}
