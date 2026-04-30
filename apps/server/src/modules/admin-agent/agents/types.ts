/**
 * Agent registry types.
 *
 * The admin chat endpoint hosts multiple agents that share infrastructure
 * (mentions, query/docs/clarify/navigate tools, OpenRouter provider) but
 * differ in *behavior policy*:
 *
 *   - `form-fill`        — drives the in-form AI sidebar. patch/apply tools
 *                          are propose-only (no `execute`); the model emits
 *                          a proposal and the frontend cards let the user
 *                          confirm before any HTTP/DB write happens.
 *   - `global-assistant` — drives the bottom-right floating chat. patch
 *                          tools have `execute` and call module services
 *                          directly; the user expects "execute, don't ask".
 *
 * Adding a new agent = one entry in `agents/registry.ts`. The shared
 * `streamChat` in `service.ts` then routes to it by `body.agentName`.
 */

import type { StopCondition, ToolChoice, ToolSet } from "ai";

// `StopCondition` is generic over a ToolSet; agents have heterogeneous
// tool sets (form-fill vs global-assistant differ), so we type it over
// the unconstrained `ToolSet` here. This matches what `stepCountIs` /
// `hasToolCall` return — `StopCondition<any>`.

import type { AgentExecDeps } from "./exec-deps";
import type { MentionSnapshot } from "../mentions/types";
import type { AdminSurface, ChatExecutionContext } from "../types";

/** Identifier the frontend sends in `ChatRequestBody.agentName`. */
export type AdminAgentName = "form-fill" | "global-assistant";

export const ADMIN_AGENT_NAMES = ["form-fill", "global-assistant"] as const;

export function isAdminAgentName(s: unknown): s is AdminAgentName {
  return typeof s === "string" && (ADMIN_AGENT_NAMES as readonly string[]).includes(s);
}

/**
 * Per-request data threaded into tool `execute` callbacks via AI SDK v6's
 * `experimental_context`. Tools are stateless module-level singletons —
 * they read this object via the second arg of `execute` instead of being
 * closed over per request, which keeps the tool definitions tree-shake
 * friendly and unit-testable.
 *
 * `service.ts` packs this into `createAgentUIStreamResponse({ options })`
 * once per request; AI SDK forwards it to every tool that has an `execute`.
 */
export type AgentToolContext = {
  execCtx: ChatExecutionContext;
  deps: AgentExecDeps;
};

/** Inputs `buildSystemPrompt` receives for a given turn. */
export type SystemPromptInput = {
  surface: AdminSurface;
  draft?: Record<string, unknown> | undefined;
  mentions: MentionSnapshot[];
  locale: "zh" | "en";
};

/** Inputs `buildTools` receives — never per-request data. */
export type BuildToolsInput = {
  surface: AdminSurface;
  /** Module ids surfaced by @-mentions; agent decides whether to enable them. */
  mentionedModuleIds: readonly string[];
};

export type AgentDefinition = {
  name: AdminAgentName;
  /** OpenRouter model id; defaults shared via `DEFAULT_MODEL_ID`. */
  modelId: string;
  /** Reasoning budget. Defaults to `stepCountIs(8)` per agent unless overridden. */
  stopWhen: StopCondition<ToolSet>;
  /**
   * Compose the system prompt. Agents share a base ApolloKit identity
   * but layer on agent-specific behavior rules (e.g. global-assistant
   * tells the model "you may execute changes; askClarification before
   * destructive ops" — form-fill tells it "you only propose").
   */
  buildSystem(input: SystemPromptInput): Promise<string>;
  /**
   * Compose the tool set. Form-fill exposes propose-only patch tools;
   * global-assistant exposes the `execute` variants. Both share the
   * base query/docs/clarify/navigate tools.
   */
  buildTools(input: BuildToolsInput): ToolSet;
  /**
   * Optional per-call `toolChoice` override. Returning `'required'` forces
   * the model to call **some** tool (it picks which) — useful when we
   * know the user's intent benefits from an action over a free-form text
   * reply. Returning `undefined` keeps the AI SDK default `'auto'`.
   *
   * Why this exists: empirically, Kimi K2 sometimes emits a "已关闭 X"
   * text response without actually invoking the patch tool when the user
   * @-mentions a resource and asks for a change. Forcing `'required'` in
   * that case prevents the hallucinated-completion failure mode without
   * having to trust the model's prompt obedience.
   */
  buildToolChoice?(input: BuildToolsInput): ToolChoice<ToolSet> | undefined;
};
