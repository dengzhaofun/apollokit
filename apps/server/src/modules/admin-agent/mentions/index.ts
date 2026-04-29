/**
 * Mention barrel — importing this file triggers side-effect registration
 * of every mention descriptor into the global registry.
 *
 * Add a new mentionable resource = create `mentions/<module>.ts` that
 * calls `registerMention(...)`, then add it to the import list below.
 *
 * Order matters: it doubles as the popover tab order on the frontend.
 * Tier-1 first, then alphabetical within tiers.
 */

import "./check-in";
import "./task";
import "./activity";
import "./item";
import "./character";
import "./dialogue";
import "./announcement";

export { getMention, listMentions, listMentionTypes } from "./registry";
export type {
  MentionDescriptor,
  MentionRef,
  MentionResult,
  MentionSnapshot,
} from "./types";
