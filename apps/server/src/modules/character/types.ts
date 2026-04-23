import type { characterDefinitions } from "../../schema/character";

export type CharacterDefinition = typeof characterDefinitions.$inferSelect;

/**
 * Narrow view handed to other modules (currently: dialogue) to flatten
 * a character into the client-facing speaker payload. Pulled out so the
 * dialogue response shape can't drift from what character exposes.
 */
export type CharacterSpeakerView = {
  id: string;
  name: string;
  avatarUrl: string | null;
  portraitUrl: string | null;
};

export const CHARACTER_SIDES = ["left", "right"] as const;
export type CharacterSide = (typeof CHARACTER_SIDES)[number];
