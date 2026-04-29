import { activityService } from "../../activity";
import type { ActivityConfig } from "../../activity/types";
import { registerMention } from "./registry";
import type { MentionDescriptor, MentionResult } from "./types";

const activityMention: MentionDescriptor<ActivityConfig> = {
  type: "activity",
  label: "活动",
  toolModuleId: null,
  async search(orgId, q, limit) {
    const page = await activityService.listActivities(orgId, { q, limit });
    return page.items.map(toResult);
  },
  async fetch(orgId, id) {
    try {
      return await activityService.getActivity(orgId, id);
    } catch {
      return null;
    }
  },
  toResult,
  toContextLine(a) {
    return `[activity] 活动 "${a.name}" (id=${a.id}, alias=${a.alias}, kind=${a.kind}, status=${a.status})`;
  },
};

function toResult(a: ActivityConfig): MentionResult {
  return {
    type: "activity",
    id: a.id,
    alias: a.alias,
    name: a.name,
    subtitle: `${a.kind} · ${a.status}`,
  };
}

registerMention(activityMention);
