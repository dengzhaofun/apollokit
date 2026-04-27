/**
 * Per-surface localStorage persistence for AI chat messages.
 *
 * Why client-side only:
 *   - Zero server changes required.
 *   - "Refresh shouldn't lose the chat" is the single user-facing
 *     requirement — that's a UX concern, not an audit concern.
 *   - Cross-device sync, multi-thread history, run audits etc. are
 *     deferred to a future server-backed iteration.
 *
 * Key shape: `admin-agent:v1:<surface>` — versioned so a future
 * UIMessage shape change can bump the prefix and ignore old payloads.
 *
 * Scope decisions:
 *   - **One thread per surface, not per resource id.** Editing config A
 *     and config B share the `<module>:edit` thread. Acceptable for v1;
 *     if it confuses users we can switch to URL-keyed threads later.
 *   - **Org-scoped is implicit:** the admin app is single-org-per-login,
 *     so localStorage is naturally org-scoped. On org switch (rare in
 *     this product), stale chats survive — small cost vs. the gain of
 *     not coupling this hook to the auth state.
 */

import type { UIMessage } from "ai"

const STORAGE_PREFIX = "admin-agent:v1:"

/** Most recent N messages kept on disk per surface. */
const ON_DISK_LIMIT = 30

/**
 * Most recent N messages sent to the server in each request.
 * Older messages stay visible in the UI (loaded from disk) but are
 * not re-fed into LLM context — keeps token cost flat for long chats.
 *
 * Why 20: covers ~5–8 conversational turns including any tool calls,
 * which is plenty for the agent's "complete a config" use case.
 */
const SEND_LIMIT = 20

function storageKey(surface: string): string {
  return `${STORAGE_PREFIX}${surface}`
}

/**
 * Read the persisted messages for a surface. Returns `[]` on:
 *   - SSR / no `window`
 *   - missing key
 *   - JSON parse failure
 *   - shape mismatch (best-effort sanity check on id/role/parts)
 */
export function loadMessages(surface: string): UIMessage[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(storageKey(surface))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((m): m is UIMessage => {
      if (!m || typeof m !== "object") return false
      const obj = m as Record<string, unknown>
      return (
        typeof obj.id === "string" &&
        typeof obj.role === "string" &&
        Array.isArray(obj.parts)
      )
    })
  } catch {
    return []
  }
}

/**
 * Persist messages for a surface, capped at ON_DISK_LIMIT.
 * On QuotaExceeded, retries once with half the entries — beyond that,
 * silently degrades (logs a warning so dev can see).
 */
export function saveMessages(surface: string, messages: UIMessage[]): void {
  if (typeof window === "undefined") return
  const key = storageKey(surface)
  const tail = messages.slice(-ON_DISK_LIMIT)
  try {
    window.localStorage.setItem(key, JSON.stringify(tail))
  } catch (err) {
    // QuotaExceededError fires when many surfaces × large chats fill
    // the ~5MB localStorage budget. Drop to half and retry; if still
    // failing, give up — the in-memory chat keeps working.
    try {
      const halved = tail.slice(-Math.max(1, Math.floor(ON_DISK_LIMIT / 2)))
      window.localStorage.setItem(key, JSON.stringify(halved))
    } catch {
      console.warn("[admin-agent] localStorage write failed", err)
    }
  }
}

/** Drop a surface's persisted thread (used by "清空对话"). */
export function clearMessages(surface: string): void {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(storageKey(surface))
}

/**
 * Trim the in-memory message list to the slice we send to the LLM.
 *
 * Two requirements:
 *   1. Cap at SEND_LIMIT so token usage stays flat as the chat grows.
 *   2. The first message **must** be `role: "user"`. Most providers
 *      (OpenAI/OpenRouter included) reject conversations that lead
 *      with an assistant turn after the system prompt. If a naive
 *      tail-slice lands on an assistant message, walk forward.
 *
 * Tool calls + results are co-located inside a single assistant
 * message's `parts` array (the part transitions through
 * `input-streaming → input-available → output-available`), so
 * message-level trimming never splits a call from its result.
 */
export function trimMessagesForSend(messages: UIMessage[]): UIMessage[] {
  if (messages.length <= SEND_LIMIT) return messages
  let start = messages.length - SEND_LIMIT
  while (start < messages.length && messages[start]!.role !== "user") {
    start++
  }
  return messages.slice(start)
}
