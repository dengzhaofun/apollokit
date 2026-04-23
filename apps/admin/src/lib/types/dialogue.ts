import type { RewardEntry } from "./rewards"
import type { LinkAction } from "./link"

export type DialogueSpeakerSide = "left" | "right"

export interface DialogueOption {
  id: string
  label: string
  next?: string
  action?: LinkAction
  rewards?: RewardEntry[]
}

/**
 * Authored speaker. Either `characterId` (reference to a row in
 * `/api/character/characters`) or `name` (inline) must be present.
 * When both are set, inline `name`/`avatarUrl` override the character
 * for this node only. `side` is always required.
 */
export interface DialogueSpeaker {
  characterId?: string
  name?: string
  avatarUrl?: string
  side: DialogueSpeakerSide
}

export interface DialogueNode {
  id: string
  speaker: DialogueSpeaker
  content: string
  next?: string
  options?: DialogueOption[]
  onEnter?: {
    rewards?: RewardEntry[]
  }
}

export type DialogueTriggerCondition =
  | { kind: "manual" }
  | { kind: "onLogin" }
  | { kind: "onScriptComplete"; scriptAlias: string }
  | { kind: "onLevel"; minLevel: number }

export interface DialogueScript {
  id: string
  organizationId: string
  alias: string | null
  name: string
  description: string | null
  startNodeId: string
  nodes: DialogueNode[]
  triggerCondition: DialogueTriggerCondition | null
  repeatable: boolean
  isActive: boolean
  metadata: unknown
  createdAt: string
  updatedAt: string
}

export interface CreateDialogueScriptInput {
  alias?: string | null
  name: string
  description?: string | null
  startNodeId: string
  nodes: DialogueNode[]
  triggerCondition?: DialogueTriggerCondition | null
  repeatable?: boolean
  isActive?: boolean
}

export type UpdateDialogueScriptInput = Partial<CreateDialogueScriptInput>

export interface DialogueScriptListResponse {
  items: DialogueScript[]
}
