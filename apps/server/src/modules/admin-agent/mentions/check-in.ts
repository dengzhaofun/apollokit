import { checkInService } from "../../check-in";
import type { CheckInConfig } from "../../check-in/types";
import { registerMention } from "./registry";
import type { MentionDescriptor, MentionResult } from "./types";

const checkInMention: MentionDescriptor<CheckInConfig> = {
  type: "check-in",
  label: "签到配置",
  toolModuleId: "check-in",
  async search(orgId, q, limit) {
    // includeActivity=true so users can @-mention activity-embedded
    // check-ins too. The standalone-only default of `listConfigs` is for
    // the admin list page; mentions need the full set.
    const page = await checkInService.listConfigs(orgId, {
      q,
      limit,
      includeActivity: true,
    });
    return page.items.map(toResult);
  },
  async fetch(orgId, id) {
    try {
      return await checkInService.getConfig(orgId, id);
    } catch {
      return null;
    }
  },
  toResult,
  toContextLine(c) {
    const flags = [
      c.isActive ? "active" : "inactive",
      `resetMode=${c.resetMode}`,
      c.target != null ? `target=${c.target}` : null,
    ]
      .filter(Boolean)
      .join(", ");
    return `[check-in] 签到配置 "${c.name}" (id=${c.id}, alias=${c.alias ?? "null"}, ${flags})`;
  },
};

function toResult(c: CheckInConfig): MentionResult {
  return {
    type: "check-in",
    id: c.id,
    alias: c.alias,
    name: c.name,
    subtitle: c.isActive ? "active" : "inactive",
  };
}

registerMention(checkInMention);
