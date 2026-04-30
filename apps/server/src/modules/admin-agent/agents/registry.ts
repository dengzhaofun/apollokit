/**
 * Agent dispatcher. Maps `agentName` (validated upstream by
 * `isAdminAgentName`) to a `AgentDefinition` factory bound to the
 * per-request `execCtx`.
 *
 * Adding a new agent (`analytics-agent`, `automation-agent`, …):
 *   1. Add a name to `AdminAgentName` in `types.ts`.
 *   2. Write `agents/<name>.ts` with a `create<Name>Agent(execCtx)` factory.
 *   3. Add a case here.
 *   4. (Frontend) wire the new name into `agents.ts` mirror + a caller.
 */

import { createFormFillAgent } from "./form-fill";
import { createGlobalAssistantAgent } from "./global-assistant";
import type { AdminAgentName, AgentDefinition } from "./types";
import type { ChatExecutionContext } from "../types";

export function createAgentForRequest(
  agentName: AdminAgentName,
  execCtx: ChatExecutionContext,
): AgentDefinition {
  switch (agentName) {
    case "form-fill":
      return createFormFillAgent(execCtx);
    case "global-assistant":
      return createGlobalAssistantAgent(execCtx);
    default: {
      // Exhaustive — TS will flag any new AdminAgentName that isn't
      // wired here.
      const _exhaustive: never = agentName;
      throw new Error(`Unknown agent: ${_exhaustive as string}`);
    }
  }
}
