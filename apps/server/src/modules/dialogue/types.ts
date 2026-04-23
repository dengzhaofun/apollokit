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

/**
 * Authored speaker. One of two shapes:
 *   - `characterId` present → references `character_definitions.id`.
 *     The dialogue service validates the id on every write and, on
 *     read, pulls name/avatarUrl from the character row so renaming a
 *     character updates all scripts that reference it.
 *   - `characterId` absent → inline speaker (free-text name + avatar).
 *     Kept for system/narration lines that don't warrant a character
 *     entry and for backwards compatibility with scripts authored
 *     before the character module existed.
 *
 * The validator enforces that one of `characterId` or `name` is present.
 * `side` is always required.
 */
export type DialogueSpeaker = {
  characterId?: string;
  name?: string;
  avatarUrl?: string;
  side: DialogueSpeakerSide;
};

export type DialogueNode = {
  id: string;
  speaker: DialogueSpeaker;
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
 * Flattened speaker delivered to the client. If the authored speaker
 * carried a `characterId`, the service resolves it server-side and
 * writes `name` / `avatarUrl` from the character row; the `characterId`
 * itself is intentionally NOT exposed — the client shouldn't need it.
 *
 * Inline speakers (no `characterId`) pass through untouched.
 */
export type ClientDialogueSpeaker = {
  name: string;
  avatarUrl?: string;
  side: DialogueSpeakerSide;
};

/**
 * Node payload returned to the client. Same shape as the authored node
 * minus `onEnter` (server-only — those rewards are granted server-side
 * before the response is sent, so the client doesn't need to know), and
 * with the speaker flattened (see `ClientDialogueSpeaker`).
 */
export type ClientDialogueNode = {
  id: string;
  speaker: ClientDialogueSpeaker;
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
