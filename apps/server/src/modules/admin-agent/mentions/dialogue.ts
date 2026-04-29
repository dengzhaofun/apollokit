import { dialogueService } from "../../dialogue";
import type { DialogueScript } from "../../dialogue/types";
import { registerMention } from "./registry";
import type { MentionDescriptor, MentionResult } from "./types";

const dialogueMention: MentionDescriptor<DialogueScript> = {
  type: "dialogue",
  label: "剧情脚本",
  toolModuleId: null,
  async search(orgId, q, limit) {
    const page = await dialogueService.listScripts(orgId, { q, limit });
    return page.items.map(toResult);
  },
  async fetch(orgId, id) {
    try {
      return await dialogueService.getScript(orgId, id);
    } catch {
      return null;
    }
  },
  toResult,
  toContextLine(d) {
    return `[dialogue] 剧情脚本 "${d.name}" (id=${d.id}, alias=${d.alias ?? "null"}, active=${d.isActive})`;
  },
};

function toResult(d: DialogueScript): MentionResult {
  return {
    type: "dialogue",
    id: d.id,
    alias: d.alias,
    name: d.name,
    subtitle: d.isActive ? "active" : "inactive",
  };
}

registerMention(dialogueMention);
