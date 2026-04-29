/**
 * Generic AI assist panel — used by every Drawer/Page that hosts AI
 * help, **and** by the global FAB.
 *
 * Sources of context (no caller-supplied props for these):
 *   - **Surface** comes from the URL via `useCurrentSurface()`.
 *   - **Apply tool name + apply helper** come from `MODULE_REGISTRY`
 *     keyed by surface's first segment.
 *   - **Form draft** comes from `useFormContext()` if a `<FormProvider>`
 *     is in scope (it will be, inside FormDrawerWithAssist). For the
 *     global FAB on `dashboard` surface there's no form, so the agent
 *     just doesn't get a `draft` field.
 *
 * This means the panel is fully self-configuring — no module-specific
 * wiring at the call site, just `<AIAssistPanel />`.
 */

import { useChat } from "@ai-sdk/react"
import { useNavigate } from "@tanstack/react-router"
import { DefaultChatTransport, type UIMessage } from "ai"
import { Trash2Icon } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { useCurrentSurface, type AdminSurface } from "#/lib/admin-surface"
import { cn } from "#/lib/utils"

import {
  Conversation,
  ConversationEmptyState,
  Message,
  MessageAvatar,
  MessageContent,
  PromptInput,
  Response,
} from "../ai-elements"
import type { MentionRef } from "./mention-types"
import { Button } from "../ui/button"
import { ApplyConfigCard } from "./ApplyConfigCard"
import { ClarifyPrompt } from "./ClarifyPrompt"
import { useFormContext } from "./FormProvider"
import { NavigateCard } from "./NavigateCard"
import {
  PatchConfigCard,
  type PatchCardState,
} from "./PatchConfigCard"
import {
  buildPatchUrl,
  isPatchToolPart,
  toolNameFromPartType,
} from "./patch-registry"
import { getModuleEntry } from "./registry"
import {
  clearMessages,
  loadMessages,
  saveMessages,
  trimMessagesForSend,
} from "./use-persisted-messages"

const ENDPOINT = "/api/ai/admin/chat"

/**
 * Public entry. Thin wrapper that keys the inner panel by surface so
 * navigating from `check-in:list` to `check-in:create` cleanly remounts
 * the chat — `useChat` reads its initial `messages` from
 * `loadMessages(surface)` on construct, and remount is the simplest way
 * to swap the seed without fighting the SDK's lifecycle.
 */
export function AIAssistPanel({
  emptyState,
}: {
  emptyState?: React.ReactNode
} = {}) {
  const surface = useCurrentSurface()
  return (
    <AIAssistPanelInner
      key={surface}
      surface={surface}
      emptyState={emptyState}
    />
  )
}

function AIAssistPanelInner({
  surface,
  emptyState,
}: {
  surface: AdminSurface
  emptyState?: React.ReactNode
}) {
  const navigate = useNavigate()
  const form = useFormContext()
  const moduleEntry = getModuleEntry(surface)
  const applyToolName = moduleEntry?.applyToolName

  // Read once on mount. The wrapper's `key={surface}` ensures we get a
  // fresh component (and thus a fresh seed) on surface change — no need
  // to re-read reactively.
  const initialMessages = React.useMemo(() => loadMessages(surface), [surface])

  // Stable ref to form so the transport closure always reads latest values.
  const formRef = React.useRef(form)
  React.useEffect(() => {
    formRef.current = form
  })

  const [appliedCalls, setAppliedCalls] = React.useState<Set<string>>(
    () => new Set(),
  )
  const [answeredCalls, setAnsweredCalls] = React.useState<Set<string>>(
    () => new Set(),
  )
  const [navigatedCalls, setNavigatedCalls] = React.useState<Set<string>>(
    () => new Set(),
  )
  /**
   * Per-callId state for patch* tool cards. Independent from
   * `appliedCalls` (which is the Set covering the surface-bound apply
   * tool) because patch firing is async and has loading / failed states
   * that the apply path doesn't.
   */
  const [patchCardStates, setPatchCardStates] = React.useState<
    Record<string, PatchCardState>
  >({})

  // Carries the mentions selected for the next outgoing message. Stored
  // in a ref (not state) so the transport closure reads the current value
  // at send time without needing to be recreated on every popover edit.
  // Consumed (cleared) inside `prepareSendMessagesRequest` after the
  // body is built.
  const pendingMentionsRef = React.useRef<MentionRef[]>([])

  const transport = React.useMemo(
    () =>
      new DefaultChatTransport({
        api: ENDPOINT,
        credentials: "include",
        prepareSendMessagesRequest: ({ messages, body }) => {
          const draft = formRef.current?.state?.values
          // Trim to the last N messages (with leading-user guarantee)
          // so token cost stays flat as the UI history grows. Older
          // turns remain visible on screen but aren't re-fed to the LLM.
          const sendable = trimMessagesForSend(messages)
          const mentions = pendingMentionsRef.current
          pendingMentionsRef.current = []
          return {
            body: {
              ...(body ?? {}),
              messages: sendable,
              context: {
                surface,
                ...(draft && Object.keys(draft).length > 0 ? { draft } : {}),
                ...(mentions.length > 0 ? { mentions } : {}),
              },
            },
          }
        },
      }),
    [surface],
  )

  const { messages, sendMessage, setMessages, addToolResult, stop, status, error } = useChat({
    messages: initialMessages,
    transport,
    onError: (err) => {
      console.error("[admin-agent]", err)
      toast.error(`AI 助手出错：${err.message}`)
    },
  })

  // Persist on every message-list change. `messages` is a new array
  // reference whenever the SDK mutates it (parts streaming, tool result
  // attached, etc.), so this fires across the full conversation
  // lifecycle — including mid-stream updates. saveMessages caps at
  // ON_DISK_LIMIT internally and is cheap when the chat is short.
  React.useEffect(() => {
    saveMessages(surface, messages)
  }, [surface, messages])

  function handleClear() {
    clearMessages(surface)
    setMessages([])
    toast.success("已清空当前会话")
  }

  function handleApply(callId: string, input: unknown) {
    if (appliedCalls.has(callId)) return
    if (!moduleEntry || !formRef.current) return
    moduleEntry.applyToForm(formRef.current, input)
    setAppliedCalls((prev) => new Set(prev).add(callId))
    // Close the apply* client-side tool call so future steps don't stall
    // on a missing tool result. The model rarely takes another step
    // after applying, but if it does it expects this signal.
    if (moduleEntry.applyToolName) {
      addToolResult({
        tool: moduleEntry.applyToolName,
        toolCallId: callId,
        output: { applied: true },
      })
    }
    toast.success("已回填表单，请审核后保存")
  }

  function handleAnswer(callId: string, text: string) {
    if (answeredCalls.has(callId)) return
    setAnsweredCalls((prev) => new Set(prev).add(callId))
    // Required: close the askClarification tool call before sending the
    // user's reply, otherwise the model errors with "Tool result is
    // missing" on the next turn.
    addToolResult({
      tool: "askClarification",
      toolCallId: callId,
      output: text,
    })
    void sendMessage({ text })
  }

  function handleNavigate(
    callId: string,
    target: { module: string; intent: "list" | "create" },
  ) {
    if (navigatedCalls.has(callId)) return
    // `/${module}/create` works for both modal-driven modules (the route
    // file `redirect`s to `?modal=create`) and NewPage modules (where
    // `/create` is a real page). `/${module}` lands on the list page.
    const path =
      target.intent === "create"
        ? `/${target.module}/create`
        : `/${target.module}`
    // Build target surface directly from module + intent rather than
    // re-parsing the URL — `computeSurface` would mis-classify a real
    // NewPage `/foo/create` as `:edit` because there's no `?modal=create`
    // on the path yet.
    const targetSurface =
      `${target.module}:${target.intent}` as AdminSurface
    // Carry the conversation over to the next surface so the user can
    // continue without retyping. The next mount keys by surface and
    // `loadMessages` picks this up. We save BEFORE `addToolResult` —
    // the navigateTo result is UI-only metadata, and trimMessagesForSend
    // strips orphan input-available tool parts before the next request
    // so the provider doesn't complain about missing tool results.
    saveMessages(targetSurface, messages)
    setNavigatedCalls((prev) => new Set(prev).add(callId))
    addToolResult({
      tool: "navigateTo",
      toolCallId: callId,
      output: { navigated: true, path },
    })
    // TanStack Router's `to` is route-id-typed; AI-driven dynamic
    // module names won't satisfy that union. Cast to `never` to opt
    // out of static check (CommandPalette uses the same pattern).
    void navigate({ to: path as never })
  }

  /**
   * Apply a patch* tool proposal: fire PATCH against the resource's
   * endpoint, transition the card through applying → applied | failed,
   * and addToolResult so the agent knows the outcome.
   *
   * The endpoint URL is templated by `patch-registry.ts` from the tool
   * name. We use credentials:include to carry the session cookie since
   * everything else under /api/* uses the same admin session.
   */
  async function handlePatchApply(
    toolName: string,
    callId: string,
    input: { key: string; patch: Record<string, unknown> },
  ) {
    if (patchCardStates[callId]?.kind === "applying") return
    const url = buildPatchUrl(toolName, input.key)
    if (!url) {
      toast.error(`未知的 patch 工具：${toolName}`)
      return
    }
    setPatchCardStates((prev) => ({ ...prev, [callId]: { kind: "applying" } }))
    try {
      const res = await fetch(url, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input.patch),
      })
      if (!res.ok) {
        // Try to surface the envelope's `message` for a useful error.
        let detail = `${res.status}`
        try {
          const body = (await res.json()) as { message?: string; code?: string }
          if (body.message) detail = body.message
          else if (body.code) detail = body.code
        } catch {
          /* ignore — fallback to status */
        }
        setPatchCardStates((prev) => ({
          ...prev,
          [callId]: { kind: "failed", message: detail },
        }))
        addToolResult({
          tool: toolName,
          toolCallId: callId,
          output: { applied: false, error: detail },
        })
        toast.error(`应用失败：${detail}`)
        return
      }
      setPatchCardStates((prev) => ({ ...prev, [callId]: { kind: "applied" } }))
      addToolResult({
        tool: toolName,
        toolCallId: callId,
        output: { applied: true },
      })
      toast.success("已应用变更")
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setPatchCardStates((prev) => ({
        ...prev,
        [callId]: { kind: "failed", message: msg },
      }))
      addToolResult({
        tool: toolName,
        toolCallId: callId,
        output: { applied: false, error: msg },
      })
      toast.error(`应用失败：${msg}`)
    }
  }

  function handlePatchReject(toolName: string, callId: string) {
    setPatchCardStates((prev) => ({ ...prev, [callId]: { kind: "rejected" } }))
    addToolResult({
      tool: toolName,
      toolCallId: callId,
      output: { applied: false, reason: "user-rejected" },
    })
  }

  function handleReject(callId?: string) {
    if (callId && moduleEntry?.applyToolName) {
      addToolResult({
        tool: moduleEntry.applyToolName,
        toolCallId: callId,
        output: { applied: false, reason: "user-rejected" },
      })
    }
    void sendMessage({ text: "这个不太对，请换一种方案重新提议" })
  }

  const isStreaming = status === "streaming" || status === "submitted"
  const showEmpty = messages.length === 0

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex shrink-0 items-start justify-between gap-2 border-b px-3 py-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground">AI 助手</p>
          <p className="text-[11px] text-muted-foreground">
            {moduleEntry
              ? "描述你的需求，AI 会帮你回填表单。审核后再保存。"
              : "可以问配置查询、模块说明等问题。"}
          </p>
        </div>
        {messages.length > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 px-2 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={handleClear}
            aria-label="清空当前会话"
            title="清空当前会话"
          >
            <Trash2Icon className="size-3.5" />
            清空
          </Button>
        ) : null}
      </div>
      {showEmpty ? (
        emptyState ?? <DefaultEmptyState surface={surface} />
      ) : (
        <Conversation>
          {messages.map((msg) => (
            <RenderedMessage
              key={msg.id}
              msg={msg}
              applyToolName={applyToolName}
              appliedCalls={appliedCalls}
              answeredCalls={answeredCalls}
              navigatedCalls={navigatedCalls}
              patchCardStates={patchCardStates}
              onApply={handleApply}
              onReject={(callId) => handleReject(callId)}
              onAnswer={handleAnswer}
              onNavigate={handleNavigate}
              onPatchApply={handlePatchApply}
              onPatchReject={handlePatchReject}
            />
          ))}
        </Conversation>
      )}
      {error ? (
        <div className="shrink-0 border-t bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error.message}
        </div>
      ) : null}
      <PromptInput
        onSubmit={(text, mentions) => {
          pendingMentionsRef.current = mentions.map<MentionRef>(({ type, id }) => ({
            type,
            id,
          }))
          void sendMessage({ text })
        }}
        onStop={stop}
        isStreaming={isStreaming}
      />
    </div>
  )
}

function DefaultEmptyState({ surface }: { surface: string }) {
  // Surface-specific suggestions help the user get started without
  // having to read the field schema.
  const suggestions = getSurfaceSuggestions(surface)
  return (
    <ConversationEmptyState
      title="试试这样问"
      description={
        <span className="block space-y-1">
          {suggestions.map((s, i) => (
            <span key={i} className="block">{`"${s}"`}</span>
          ))}
        </span>
      }
    />
  )
}

function getSurfaceSuggestions(surface: string): string[] {
  // List/dashboard surfaces → query-mode prompts (no form to fill).
  if (surface === "dashboard" || surface.endsWith(":list")) {
    return [
      "列出最近的签到配置",
      "查找 alias 含 daily 的配置",
      "这个活动的参与情况怎么样",
    ]
  }
  // Form-bearing surfaces → module-specific create/edit prompts.
  if (surface.startsWith("check-in:")) {
    return ["我要 7 日签到", "按月签到 30 天", "累计签到 100 天奖励"]
  }
  return ["描述你想要的配置 ..."]
}

type ToolPart = {
  toolCallId: string
  state:
    | "input-streaming"
    | "input-available"
    | "output-available"
    | "output-error"
  input?: unknown
}

function RenderedMessage({
  msg,
  applyToolName,
  appliedCalls,
  answeredCalls,
  navigatedCalls,
  patchCardStates,
  onApply,
  onReject,
  onAnswer,
  onNavigate,
  onPatchApply,
  onPatchReject,
}: {
  msg: UIMessage
  applyToolName: string | undefined
  appliedCalls: Set<string>
  answeredCalls: Set<string>
  navigatedCalls: Set<string>
  patchCardStates: Record<string, PatchCardState>
  onApply: (callId: string, input: unknown) => void
  onReject: (callId: string) => void
  onAnswer: (callId: string, text: string) => void
  onNavigate: (
    callId: string,
    target: { module: string; intent: "list" | "create" },
  ) => void
  onPatchApply: (
    toolName: string,
    callId: string,
    input: { key: string; patch: Record<string, unknown> },
  ) => void
  onPatchReject: (toolName: string, callId: string) => void
}) {
  if (msg.role === "system") return null
  const role = msg.role === "user" ? "user" : "assistant"
  const applyToolType = applyToolName ? `tool-${applyToolName}` : null

  // Render each part with its own MessageContent (bubble for text,
  // flat for tool cards so their own border isn't nested in a bubble).
  const rendered = msg.parts
    .map((part, i): React.ReactNode => {
      if (part.type === "text") {
        return (
          <MessageContent key={i} variant="contained">
            <Response>{part.text}</Response>
          </MessageContent>
        )
      }
      if (applyToolType && part.type === applyToolType) {
        const tp = part as unknown as ToolPart
        return (
          <MessageContent key={i} variant="flat" className="w-full max-w-md">
            <ApplyConfigCard
              toolName={applyToolName!}
              state={tp.state}
              proposed={(tp.input ?? {}) as Record<string, unknown>}
              applied={appliedCalls.has(tp.toolCallId)}
              onApply={() => {
                if (tp.input !== undefined) onApply(tp.toolCallId, tp.input)
              }}
              onReject={() => onReject(tp.toolCallId)}
            />
          </MessageContent>
        )
      }
      if (part.type === "tool-navigateTo") {
        const tp = part as unknown as ToolPart & {
          input?: {
            module?: string
            intent?: "list" | "create"
            reason?: string
          }
        }
        const input = tp.input ?? {}
        if (!input.module || !input.intent) return null
        return (
          <MessageContent key={i} variant="flat" className="w-full max-w-md">
            <NavigateCard
              state={tp.state}
              module={input.module}
              intent={input.intent}
              reason={input.reason ?? ""}
              navigated={navigatedCalls.has(tp.toolCallId)}
              onNavigate={() =>
                onNavigate(tp.toolCallId, {
                  module: input.module!,
                  intent: input.intent!,
                })
              }
            />
          </MessageContent>
        )
      }
      // Patch* cards — partial updates to @-mentioned resources. The
      // server-side `patch-registry` enumerates tool names; we render
      // them all uniformly via PatchConfigCard. Distinct from the
      // surface-bound apply tool above because patches don't depend
      // on a form being in scope (they fire PATCH directly against
      // the resource endpoint).
      if (isPatchToolPart(part.type)) {
        const tp = part as unknown as ToolPart & {
          input?: { key?: string; patch?: Record<string, unknown> }
        }
        const input = tp.input ?? {}
        if (!input.key || !input.patch) return null
        const toolName = toolNameFromPartType(part.type)
        const cardState = patchCardStates[tp.toolCallId] ?? { kind: "idle" }
        return (
          <MessageContent key={i} variant="flat" className="w-full max-w-md">
            <PatchConfigCard
              toolName={toolName}
              state={tp.state}
              resourceKey={input.key}
              patch={input.patch}
              cardState={cardState}
              onApply={() =>
                onPatchApply(toolName, tp.toolCallId, {
                  key: input.key!,
                  patch: input.patch!,
                })
              }
              onReject={() => onPatchReject(toolName, tp.toolCallId)}
            />
          </MessageContent>
        )
      }
      if (part.type === "tool-askClarification") {
        const tp = part as unknown as ToolPart & {
          input?: { field?: string; question?: string; suggestions?: string[] }
        }
        const input = tp.input ?? {}
        if (!input.question) return null
        return (
          <MessageContent key={i} variant="flat" className="w-full max-w-md">
            <ClarifyPrompt
              state={tp.state}
              field={input.field ?? ""}
              question={input.question}
              suggestions={input.suggestions}
              answered={answeredCalls.has(tp.toolCallId)}
              onAnswer={(text) => onAnswer(tp.toolCallId, text)}
            />
          </MessageContent>
        )
      }
      // Unknown part (e.g. tool-queryModule output) — model summarizes
      // in a text part, no need to render the tool call itself.
      return null
    })
    .filter((node) => node !== null)

  if (rendered.length === 0) return null

  return (
    <Message from={role}>
      {role === "assistant" ? (
        <MessageAvatar name="AI" />
      ) : null}
      {/* Stack each part vertically inside the message row. */}
      <div className={cn(
        "flex max-w-[85%] flex-col gap-1.5",
        role === "user" ? "items-end" : "items-start",
      )}>
        {rendered}
      </div>
    </Message>
  )
}
