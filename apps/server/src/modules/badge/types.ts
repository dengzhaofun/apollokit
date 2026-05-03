import type {
  BadgeDismissal,
  BadgeNode,
  BadgeSignal,
  BadgeSignalRegistryEntry,
} from "../../schema/badge";

// Re-exports for module consumers. Enum values + types live next to the
// schema in `../../schema/badge.ts` so they ship with the table
// definition and auto-import cleanly from validators / services.
export type {
  BadgeAggregation,
  BadgeDismissMode,
  BadgeDisplayType,
  BadgeSignalMatchMode,
} from "../../schema/badge";
export {
  BADGE_AGGREGATIONS,
  BADGE_DISMISS_MODES,
  BADGE_DISPLAY_TYPES,
  BADGE_SIGNAL_MATCH_MODES,
} from "../../schema/badge";

export type { BadgeNode, BadgeSignal, BadgeDismissal, BadgeSignalRegistryEntry };

// ─── Service-layer I/O shapes ────────────────────────────────────

export const BADGE_SIGNAL_MODES = ["set", "add", "clear"] as const;
export type BadgeSignalMode = (typeof BADGE_SIGNAL_MODES)[number];

/**
 * Input to `BadgeService.signal(...)`. Customer-side authoritative data
 * push. `tenantId` is always resolved by the caller (middleware
 * strips it from the request context — never trust it from the body).
 */
export type SignalInput = {
  endUserId: string;
  signalKey: string;
  mode: BadgeSignalMode;
  count?: number; // required for set/add
  version?: string | null;
  meta?: Record<string, unknown> | null;
  tooltipKey?: string | null;
  expiresAt?: Date | null;
};

/**
 * Node view returned to the client. Tree is rendered by the UI.
 *
 * `count` is the post-aggregation, post-dismissal count. 0 means the
 * red dot should NOT be shown — higher values drive number/gift
 * badges, `firstAppearedAt` lets the client decide between a fresh
 * "NEW" animation and a steady-state badge.
 *
 * `explain` is only populated when `/preview` is called with
 * `explain: true`. For normal /tree requests it is `undefined` so the
 * wire shape stays lean.
 */
export type BadgeTreeNode = {
  key: string;
  displayType: string;
  displayLabelKey: string | null;
  count: number;
  version: string | null;
  firstAppearedAt: string | null; // ISO
  meta: Record<string, unknown> | null;
  tooltipKey: string | null;
  children: BadgeTreeNode[];
  explain?: BadgeNodeExplain;
};

/**
 * Debug annotations for the Inspector panel. Tells a human WHY this
 * node is lit or dark. Only emitted on /preview, never on /tree.
 */
export type BadgeNodeExplain = {
  reason: string;
  rawSignalCount: number;
  aggregation: string;
  dismissMode: string;
  dismissal?: {
    dismissedAt: string;
    dismissedVersion: string | null;
    periodKey: string | null;
    sessionId: string | null;
    stale: boolean;
  };
  matchedSignalKeys: string[];
};
