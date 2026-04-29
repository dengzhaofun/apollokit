import { itemService } from "../../item";
import type { ItemDefinition } from "../../item/types";
import { registerMention } from "./registry";
import type { MentionDescriptor, MentionResult } from "./types";

const itemMention: MentionDescriptor<ItemDefinition> = {
  type: "item",
  label: "道具",
  toolModuleId: null,
  async search(orgId, q, limit) {
    const page = await itemService.listDefinitions(orgId, { q, limit });
    return page.items.map(toResult);
  },
  async fetch(orgId, id) {
    try {
      return await itemService.getDefinition(orgId, id);
    } catch {
      return null;
    }
  },
  toResult,
  toContextLine(i) {
    return `[item] 道具 "${i.name}" (id=${i.id}, alias=${i.alias ?? "null"}, active=${i.isActive})`;
  },
};

function toResult(i: ItemDefinition): MentionResult {
  return {
    type: "item",
    id: i.id,
    alias: i.alias,
    name: i.name,
    subtitle: i.isActive ? "active" : "inactive",
  };
}

registerMention(itemMention);
