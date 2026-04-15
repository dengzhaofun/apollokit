import type {
  dialogueProgress,
  dialogueScripts,
} from "../../schema/dialogue";
import type { ItemEntry } from "../item/types";
import type { LinkAction } from "../link/types";

export type DialogueScript = typeof dialogueScripts.$inferSelect;
export type DialogueProgress = typeof dialogueProgress.$inferSelect;

// ─── jsonb payload types ────────────────────────────────────────

export type DialogueOption = {
  id: string;
  label: string;
  /** Next node id to advance to. Omit to end the script on this option. */
  next?: string;
  /** Optional click-action (external URL or internal route). */
  action?: LinkAction;
  /** Optional rewards granted to the end user when this option is chosen. */
  rewards?: ItemEntry[];
};

export type DialogueSpeakerSide = "left" | "right";

export type DialogueNode = {
  id: string;
  speaker: {
    name: string;
    avatarUrl?: string;
    side: DialogueSpeakerSide;
  };
  content: string;
  /**
   * Default next node when this node has no `options`. Omit to end the
   * script on this node.
   */
  next?: string;
  options?: DialogueOption[];
  /**
   * Rewards granted when the user first enters this node. Idempotent —
   * service de-dupes on (scriptId, endUserId, "enter", nodeId) via
   * item_grant_logs.
   */
  onEnter?: {
    rewards?: ItemEntry[];
  };
};

export type DialogueTriggerCondition =
  | { kind: "manual" }
  | { kind: "onLogin" }
  | { kind: "onScriptComplete"; scriptAlias: string }
  | { kind: "onLevel"; minLevel: number };

// ─── Client-facing node view ────────────────────────────────────

/**
 * Node payload returned to the client. Same shape as the authored node
 * minus `onEnter` (server-only — those rewards are granted server-side
 * before the response is sent, so the client doesn't need to know).
 */
export type ClientDialogueNode = {
  id: string;
  speaker: DialogueNode["speaker"];
  content: string;
  next?: string;
  options?: Array<Omit<DialogueOption, "rewards">>;
  /** True if this node has no `next` and no options (or empty options). */
  isTerminal: boolean;
};

export type DialogueRewardGrant = {
  origin: "enter" | "option";
  nodeId: string;
  optionId?: string;
  rewards: ItemEntry[];
};

/**
 * State returned to the client on every /start and /advance call.
 *
 * `grantedRewards` collects rewards earned during this call — both the
 * node-enter bonuses and the option-selected bonuses get listed so the
 * frontend can show a single "you got X" toast.
 */
export type DialogueSessionView = {
  scriptId: string;
  scriptAlias: string;
  currentNode: ClientDialogueNode | null;
  historyPath: string[];
  completedAt: string | null;
  grantedRewards: DialogueRewardGrant[];
};
