import { characterService } from "../../character";
import type { CharacterDefinition } from "../../character/types";
import { registerMention } from "./registry";
import type { MentionDescriptor, MentionResult } from "./types";

const characterMention: MentionDescriptor<CharacterDefinition> = {
  type: "character",
  label: "角色",
  toolModuleId: "character",
  async search(orgId, q, limit) {
    const page = await characterService.listCharacters(orgId, { q, limit });
    return page.items.map(toResult);
  },
  async fetch(orgId, id) {
    try {
      return await characterService.getCharacter(orgId, id);
    } catch {
      return null;
    }
  },
  toResult,
  toContextLine(c) {
    return `[character] 角色 "${c.name}" (id=${c.id}, alias=${c.alias ?? "null"}, active=${c.isActive})`;
  },
};

function toResult(c: CharacterDefinition): MentionResult {
  return {
    type: "character",
    id: c.id,
    alias: c.alias,
    name: c.name,
    subtitle: c.isActive ? "active" : "inactive",
  };
}

registerMention(characterMention);
