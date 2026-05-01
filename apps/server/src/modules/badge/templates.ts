import type { CreateNodeInput } from "./validators";

/**
 * Pre-built node templates. Runtime-only constants — not persisted. A
 * template supplies the display + dismiss shape; the customer fills in
 * the concrete signalKey / signalKeyPrefix / parentKey / key when they
 * instantiate.
 *
 * `requires` tells the Admin UI which field the customer must fill in
 * so the wizard can render the appropriate prompt.
 */

export type BadgeTemplate = {
  id: string;
  label: string;
  description: string;
  defaults: Omit<
    CreateNodeInput,
    "key" | "parentKey" | "signalKey" | "signalKeyPrefix" | "displayLabelKey"
  >;
  requires: ("signalKey" | "signalKeyPrefix")[];
};

export const BADGE_TEMPLATES: BadgeTemplate[] = [
  {
    id: "dynamic_list_number",
    label: "动态列表聚合(数字)",
    description:
      "Aggregates all matching dynamic signals into a single number badge. Use for unread mail counts, pending quest lists, etc.",
    defaults: {
      displayType: "number",
      signalMatchMode: "prefix",
      aggregation: "sum",
      dismissMode: "auto",
      isActive: true,
    },
    requires: ["signalKeyPrefix"],
  },
  {
    id: "claimable_reward_gift",
    label: "可领取奖励(礼盒)",
    description:
      "Gift icon badge for claimable rewards. Clear signal when customer service grants the reward.",
    defaults: {
      displayType: "gift",
      signalMatchMode: "exact",
      aggregation: "none",
      dismissMode: "auto",
      isActive: true,
    },
    requires: ["signalKey"],
  },
  {
    id: "presence_dot",
    label: "存在性点亮(点)",
    description:
      "Pure dot — on whenever any matching signal has count > 0. Good for activity menus or sub-tabs.",
    defaults: {
      displayType: "dot",
      signalMatchMode: "prefix",
      aggregation: "any",
      dismissMode: "auto",
      isActive: true,
    },
    requires: ["signalKeyPrefix"],
  },
  {
    id: "daily_resettable_number",
    label: "每日重置数字",
    description:
      "Counts reset every day (player timezone). Use for daily tasks, login rewards.",
    defaults: {
      displayType: "number",
      signalMatchMode: "prefix",
      aggregation: "sum",
      dismissMode: "daily",
      dismissConfig: { periodType: "daily" },
      isActive: true,
    },
    requires: ["signalKeyPrefix"],
  },
  {
    id: "new_feature_promo",
    label: "新功能提示(NEW)",
    description:
      "NEW label. Player tap permanently dismisses until a new version (product release) relights.",
    defaults: {
      displayType: "new",
      signalMatchMode: "exact",
      aggregation: "none",
      dismissMode: "manual",
      isActive: true,
    },
    requires: ["signalKey"],
  },
  {
    id: "operational_hot_promo",
    label: "运营热推(HOT)",
    description:
      "HOT label. Each push of a new `version` value relights. Player tap dismisses until the next bump.",
    defaults: {
      displayType: "hot",
      signalMatchMode: "exact",
      aggregation: "none",
      dismissMode: "version",
      isActive: true,
    },
    requires: ["signalKey"],
  },
  {
    id: "warning_cooldown",
    label: "系统警告(叹号 + 24h 冷却)",
    description:
      "Exclamation mark. Re-lights 24h after player dismisses. Use for system alerts that deserve repeat attention.",
    defaults: {
      displayType: "exclamation",
      signalMatchMode: "exact",
      aggregation: "none",
      dismissMode: "cooldown",
      dismissConfig: { cooldownSec: 86400 },
      isActive: true,
    },
    requires: ["signalKey"],
  },
  {
    id: "unread_manual_dot",
    label: "未读通知(点 + 手动消)",
    description:
      "Dot that stays lit until the player explicitly taps. Use for announcements, event pages.",
    defaults: {
      displayType: "dot",
      signalMatchMode: "exact",
      aggregation: "none",
      dismissMode: "manual",
      isActive: true,
    },
    requires: ["signalKey"],
  },
];

export function findBadgeTemplate(id: string): BadgeTemplate | undefined {
  return BADGE_TEMPLATES.find((t) => t.id === id);
}
