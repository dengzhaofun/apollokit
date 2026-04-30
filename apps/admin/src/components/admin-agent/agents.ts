/**
 * Mirror of the server's `AdminAgentName` literal type. Kept hand-typed
 * to avoid pulling server source into the admin bundle (no shared
 * package between admin and server for this kind of small constant).
 *
 * Adding a new agent on the server: also add it here, plus a behavior
 * entry below if its tool-rendering policy differs.
 */
export type AdminAgentName = "form-fill" | "global-assistant"

/**
 * Agent-specific UI behavior the panel branches on.
 *
 * Both agents currently use `confirm-card` for patch tool calls — the
 * server-side patch tools are propose-only because LLMs (Kimi K2 and
 * DeepSeek V3.1 both verified) hallucinate extra patch fields and would
 * destructively overwrite values the user never asked to change. A
 * one-click confirm card is the safety net.
 *
 * `executed-card` is reserved for a future agent (or future model trust
 * level) where the server-side `execute` variant of patch tools fires
 * directly. The dispatch shape stays as a union so we can flip it back
 * without restructuring.
 */
export type AgentBehavior = {
  /** Show `PatchConfigCard` (confirm + diff) vs `PatchExecutedCard` (read-only). */
  patchToolStyle: "confirm-card" | "executed-card"
  /**
   * Whether the panel exposes the surface-bound `apply*` tool path. Only
   * form-fill does — global-assistant doesn't surface "create new
   * resource" in chat (that flow stays in the form drawer).
   */
  rendersApplyCard: boolean
}

export const AGENT_BEHAVIOR: Record<AdminAgentName, AgentBehavior> = {
  "form-fill": {
    patchToolStyle: "confirm-card",
    rendersApplyCard: true,
  },
  "global-assistant": {
    patchToolStyle: "confirm-card",
    rendersApplyCard: false,
  },
}
