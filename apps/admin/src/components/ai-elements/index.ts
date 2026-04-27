/**
 * Local "AI Elements" — small set of chat-UI primitives, hand-rolled
 * to mirror Vercel's `ai-elements` shadcn registry without taking the
 * external CLI dependency.
 *
 * Add more components as the agent gains capabilities (Reasoning,
 * Sources, Suggestions, etc.). Or, if/when it becomes worthwhile,
 * run `npx ai-elements@latest` to import the official versions —
 * the import path stays the same (`#/components/ai-elements/*`).
 */
export { Conversation, ConversationEmptyState } from "./conversation"
export { Message, MessageAvatar, MessageContent } from "./message"
export { PromptInput } from "./prompt-input"
export { Response } from "./response"
export { Tool, type ToolCallState } from "./tool"
