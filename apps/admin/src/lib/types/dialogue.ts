import type { ItemEntry } from "./item"
import type { LinkAction } from "./link"

export type DialogueSpeakerSide = "left" | "right"

export interface DialogueOption {
  id: string
  label: string
  next?: string
  action?: LinkAction
  rewards?: ItemEntry[]
}

export interface DialogueNode {
  id: string
  speaker: {
    name: string
    avatarUrl?: string
    side: DialogueSpeakerSide
  }
  content: string
  next?: string
  options?: DialogueOption[]
  onEnter?: {
    rewards?: ItemEntry[]
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
