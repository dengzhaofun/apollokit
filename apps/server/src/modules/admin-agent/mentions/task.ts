import { taskService } from "../../task";
import type { TaskDefinition } from "../../task/types";
import { registerMention } from "./registry";
import type { MentionDescriptor, MentionResult } from "./types";

const taskMention: MentionDescriptor<TaskDefinition> = {
  type: "task",
  label: "任务",
  // No apply tool registered for task yet — mention is read-only until
  // `applyTaskDefinition` lands in `apply-registry`.
  toolModuleId: null,
  async search(orgId, q, limit) {
    // includeActivity=true → mention can pick up activity-embedded tasks
    // too. Default of `listDefinitions` hides them from the admin list
    // page; mentions need the full set.
    const page = await taskService.listDefinitions(orgId, {
      q,
      limit,
      includeActivity: true,
    });
    return page.items.map(toResult);
  },
  async fetch(orgId, id) {
    try {
      return await taskService.getDefinition(orgId, id);
    } catch {
      return null;
    }
  },
  toResult,
  toContextLine(t) {
    return `[task] 任务 "${t.name}" (id=${t.id}, alias=${t.alias ?? "null"}, active=${t.isActive})`;
  },
};

function toResult(t: TaskDefinition): MentionResult {
  return {
    type: "task",
    id: t.id,
    alias: t.alias,
    name: t.name,
    subtitle: t.isActive ? "active" : "inactive",
  };
}

registerMention(taskMention);
