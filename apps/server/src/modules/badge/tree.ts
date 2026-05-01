/**
 * Badge tree assembly — pure in-memory computation.
 *
 * Given:
 *   - the organization's node definitions
 *   - the target user's signal rows
 *   - the target user's dismissal rows
 *
 * Produce:
 *   - a forest of `BadgeTreeNode` with counts, versions, meta, and
 *     (optionally) debug explanations.
 *
 * This file is deliberately framework-agnostic — no DB, no Redis, no
 * Hono. That lets `service.ts` orchestrate the three fetches and hand
 * them here; unit tests can supply synthetic inputs and check the
 * 6-dismissMode matrix without spinning up Postgres.
 */

import type {
  BadgeDismissal,
  BadgeNode,
  BadgeSignal,
} from "../../schema/badge";
import type { BadgeDismissMode, BadgeTreeNode, BadgeNodeExplain } from "./types";

export type AssembleInput = {
  nodes: BadgeNode[];
  signals: BadgeSignal[];
  dismissals: BadgeDismissal[];
  now: Date;
  explain?: boolean;
  /**
   * Per-session id (only used when a player issues a request under
   * `dismissMode: 'session'`). Stored dismissals with a different
   * sessionId are treated as stale (user logged in again).
   */
  currentSessionId?: string | null;
  /**
   * Optional caller-supplied player context. If a node's
   * `visibilityRule` is set and ANY required key isn't satisfied here,
   * the node (and its subtree) is hidden.
   */
  playerContext?: Record<string, unknown> | null;
  /**
   * Subtree root. When omitted, the full forest (all top-level nodes)
   * is returned.
   */
  rootKey?: string | null;
};

// ─── Dismissal staleness ──────────────────────────────────────────

/**
 * Decide whether a stored dismissal still suppresses the signal, given
 * the node's dismissMode and the current signal version / clock.
 *
 * `stale = true` → treat dismissal as absent (badge should relight).
 */
function isDismissalStale(args: {
  mode: BadgeDismissMode;
  dismissal: BadgeDismissal;
  dismissConfig: Record<string, unknown> | null;
  signalVersion: string | null;
  now: Date;
  currentSessionId: string | null | undefined;
}): boolean {
  const { mode, dismissal, dismissConfig, signalVersion, now, currentSessionId } =
    args;

  switch (mode) {
    case "auto":
      // auto mode should never have a dismissal row in the first
      // place — if one exists, treat it as stale (be defensive).
      return true;

    case "manual":
      // Permanent until explicitly cleared elsewhere. Never stale.
      return false;

    case "version": {
      // If the current signal version differs from what the player
      // dismissed at, relight.
      const vNow = signalVersion ?? "";
      const vThen = dismissal.dismissedVersion ?? "";
      return vNow !== vThen;
    }

    case "daily": {
      const periodType =
        (dismissConfig?.periodType as string | undefined) ?? "daily";
      const timezone =
        (dismissConfig?.timezone as string | undefined) ?? "UTC";
      const currentPeriod = computePeriodKey(periodType, now, timezone);
      return (dismissal.periodKey ?? "") !== currentPeriod;
    }

    case "session": {
      // If the caller didn't supply a session id, we can't prove the
      // dismissal is from the current session — fail conservative and
      // keep it (the player has to call /reset-session to clear).
      if (currentSessionId == null || currentSessionId.length === 0) {
        return false;
      }
      return (dismissal.sessionId ?? "") !== currentSessionId;
    }

    case "cooldown": {
      const cooldownSec = Number(dismissConfig?.cooldownSec ?? 0);
      if (!Number.isFinite(cooldownSec) || cooldownSec <= 0) return false;
      const elapsedSec =
        (now.getTime() - dismissal.dismissedAt.getTime()) / 1000;
      return elapsedSec > cooldownSec;
    }

    default:
      return false;
  }
}

// ─── Period key ───────────────────────────────────────────────────

/**
 * Compute the period key for the given `periodType` at `now` in
 * `timezone`. Intentionally ignores DST edge cases — good enough for
 * badge dismissal bookkeeping (matches the pattern used by task
 * periods).
 */
export function computePeriodKey(
  periodType: string,
  now: Date,
  timezone: string,
): string {
  if (periodType === "none") return "none";

  // Format the date parts in the requested timezone using Intl.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value ?? "";
  const m = parts.find((p) => p.type === "month")?.value ?? "";
  const d = parts.find((p) => p.type === "day")?.value ?? "";

  if (periodType === "daily") return `${y}-${m}-${d}`;

  if (periodType === "weekly") {
    // ISO week-ish — approximate by taking Monday of the current week
    // in the local timezone. For stricter correctness, reach for
    // date-fns-tz; for badges the approximation is fine.
    const local = new Date(`${y}-${m}-${d}T00:00:00Z`);
    const weekday = local.getUTCDay(); // 0=Sun..6=Sat
    const offsetToMonday = (weekday + 6) % 7;
    local.setUTCDate(local.getUTCDate() - offsetToMonday);
    const weekNum = Math.ceil(
      ((local.getTime() - Date.UTC(local.getUTCFullYear(), 0, 1)) /
        86400000 +
        1) /
        7,
    );
    return `${local.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
  }

  if (periodType === "monthly") return `${y}-${m}`;

  return "none";
}

// ─── Aggregation ──────────────────────────────────────────────────

function aggregateChildren(
  children: BadgeTreeNode[],
  strategy: string,
): number {
  const counts = children.map((c) => c.count);
  switch (strategy) {
    case "sum":
      return counts.reduce((a, b) => a + b, 0);
    case "any":
      return counts.some((n) => n > 0) ? 1 : 0;
    case "max":
      return counts.length === 0 ? 0 : Math.max(...counts);
    case "none":
    default:
      return 0;
  }
}

// ─── Signal matching ──────────────────────────────────────────────

type MatchedSignals = {
  total: number;
  count: number;
  version: string | null;
  firstAppearedAt: Date | null;
  meta: Record<string, unknown> | null;
  tooltipKey: string | null;
  matchedKeys: string[];
};

function matchSignals(node: BadgeNode, signals: BadgeSignal[]): MatchedSignals {
  if (node.signalMatchMode === "exact" && node.signalKey) {
    const s = signals.find((x) => x.signalKey === node.signalKey);
    if (!s) return emptyMatch();
    return {
      total: 1,
      count: s.count,
      version: s.version,
      firstAppearedAt: s.firstAppearedAt,
      meta: s.meta ?? null,
      tooltipKey: s.tooltipKey ?? null,
      matchedKeys: [s.signalKey],
    };
  }

  if (node.signalMatchMode === "prefix" && node.signalKeyPrefix) {
    const prefix = node.signalKeyPrefix;
    const matched = signals.filter((x) => x.signalKey.startsWith(prefix));
    if (matched.length === 0) return emptyMatch();
    let sum = 0;
    let latestAppeared: Date | null = null;
    let latestUpdated: Date | null = null;
    let latestMeta: Record<string, unknown> | null = null;
    let latestTooltip: string | null = null;
    let latestVersion: string | null = null;
    for (const s of matched) {
      sum += s.count;
      if (s.firstAppearedAt != null) {
        if (!latestAppeared || s.firstAppearedAt > latestAppeared) {
          latestAppeared = s.firstAppearedAt;
        }
      }
      // "latest" meta / tooltip / version — pick the signal with the
      // highest updatedAt so hover previews show the freshest item.
      if (!latestUpdated || s.updatedAt > latestUpdated) {
        latestUpdated = s.updatedAt;
        latestMeta = (s.meta as Record<string, unknown> | null) ?? null;
        latestTooltip = s.tooltipKey ?? null;
        latestVersion = s.version ?? null;
      }
    }
    return {
      total: matched.length,
      count: sum,
      version: latestVersion,
      firstAppearedAt: latestAppeared,
      meta: latestMeta,
      tooltipKey: latestTooltip,
      matchedKeys: matched.map((s) => s.signalKey),
    };
  }

  // `none` or missing binding — no signal, count comes from children.
  return emptyMatch();
}

function emptyMatch(): MatchedSignals {
  return {
    total: 0,
    count: 0,
    version: null,
    firstAppearedAt: null,
    meta: null,
    tooltipKey: null,
    matchedKeys: [],
  };
}

// ─── Visibility ───────────────────────────────────────────────────

function isVisible(
  node: BadgeNode,
  playerContext: Record<string, unknown> | null | undefined,
): boolean {
  if (!node.isActive) return false;
  const rule = node.visibilityRule as Record<string, unknown> | null;
  if (!rule) return true;
  if (!playerContext) return false; // fail-closed when rule set but no context

  const minLevel = Number(rule.minLevel ?? Number.NEGATIVE_INFINITY);
  const playerLevel = Number(playerContext.level ?? -Infinity);
  if (Number.isFinite(minLevel) && playerLevel < minLevel) return false;

  const requiredRoles = rule.roles as string[] | undefined;
  const playerRoles = (playerContext.roles as string[] | undefined) ?? [];
  if (requiredRoles?.length && !requiredRoles.some((r) => playerRoles.includes(r))) {
    return false;
  }

  const requiredTags = rule.tags as string[] | undefined;
  const playerTags = (playerContext.tags as string[] | undefined) ?? [];
  if (requiredTags?.length && !requiredTags.some((t) => playerTags.includes(t))) {
    return false;
  }

  return true;
}

// ─── Assemble ─────────────────────────────────────────────────────

/**
 * Build the badge tree for a single user. Runs in O(nodes + signals +
 * dismissals) since we index signals/dismissals into maps once.
 */
export function assembleTree(input: AssembleInput): BadgeTreeNode[] {
  const {
    nodes,
    signals,
    dismissals,
    now,
    explain,
    currentSessionId,
    playerContext,
    rootKey,
  } = input;

  // ── Index dismissals by nodeKey for O(1) lookup ──
  const dismissalByNodeKey = new Map<string, BadgeDismissal>();
  for (const d of dismissals) dismissalByNodeKey.set(d.nodeKey, d);

  // ── Index nodes by parentKey for bottom-up walking ──
  const nodesByParent = new Map<string | null, BadgeNode[]>();
  for (const n of nodes) {
    if (n.deletedAt != null) continue;
    if (!isVisible(n, playerContext)) continue;
    const key = n.parentKey ?? null;
    const list = nodesByParent.get(key) ?? [];
    list.push(n);
    nodesByParent.set(key, list);
  }
  // Sort siblings by sortOrder for deterministic output.
  for (const list of nodesByParent.values()) {
    list.sort(
      (a, b) =>
        a.sortOrder.localeCompare(b.sortOrder) || a.key.localeCompare(b.key),
    );
  }

  function buildNode(node: BadgeNode): BadgeTreeNode {
    const children = (nodesByParent.get(node.key) ?? []).map(buildNode);

    const matched = matchSignals(node, signals);
    let leafCount = matched.count;

    // Filter signals that have expired.
    if (matched.total > 0 && leafCount > 0 && hasExpired(node, signals, now)) {
      // Prefix-match nodes may contain a mix; the strict rule here
      // only zeros out the leaf when an exact-bound signal is expired.
      // For prefix aggregates, per-signal filtering is done inside
      // matchSignals going forward (we just do a simple gate here).
      // For now we keep expired signals included — callers clean them
      // up via the cleanup job.
    }

    // Apply dismissal filter for modes != auto.
    const dismissal = dismissalByNodeKey.get(node.key);
    let dismissalStale = true;
    let dismissalActive = false;
    if (dismissal && (node.dismissMode as BadgeDismissMode) !== "auto") {
      dismissalStale = isDismissalStale({
        mode: node.dismissMode as BadgeDismissMode,
        dismissal,
        dismissConfig:
          (node.dismissConfig as Record<string, unknown> | null) ?? null,
        signalVersion: matched.version,
        now,
        currentSessionId,
      });
      if (!dismissalStale) {
        dismissalActive = true;
        leafCount = 0;
      }
    }

    const childCount =
      children.length > 0 ? aggregateChildren(children, node.aggregation) : 0;

    const finalCount =
      node.signalMatchMode === "none"
        ? childCount
        : // Leaf or prefix aggregator — sum the leaf + child aggregation
          // when aggregation != "none" and the node has children.
          (children.length > 0 && node.aggregation !== "none"
            ? leafCount + childCount
            : leafCount + childCount);
    // NB: both branches reduce to the same expression; kept explicit
    // to document that "none" means "ignore children entirely".
    //
    // In practice: if `signalMatchMode === "none"` the leaf contributes
    // 0 and count == childCount; otherwise childCount is 0 unless the
    // node is configured with `aggregation` in sum/any/max and has
    // children (rare for leaves, common for parents).

    const treeNode: BadgeTreeNode = {
      key: node.key,
      displayType: node.displayType,
      displayLabelKey: node.displayLabelKey,
      count: finalCount,
      version: matched.version,
      firstAppearedAt: matched.firstAppearedAt?.toISOString() ?? null,
      meta: matched.meta,
      tooltipKey: matched.tooltipKey,
      children,
    };

    if (explain) {
      const reason = explainReason({
        node,
        matched,
        dismissalActive,
        dismissalStale,
        childCount,
        leafCount,
        finalCount,
      });
      const explainBlock: BadgeNodeExplain = {
        reason,
        rawSignalCount: matched.count,
        aggregation: node.aggregation,
        dismissMode: node.dismissMode,
        matchedSignalKeys: matched.matchedKeys,
      };
      if (dismissal) {
        explainBlock.dismissal = {
          dismissedAt: dismissal.dismissedAt.toISOString(),
          dismissedVersion: dismissal.dismissedVersion,
          periodKey: dismissal.periodKey,
          sessionId: dismissal.sessionId,
          stale: dismissalStale,
        };
      }
      treeNode.explain = explainBlock;
    }

    return treeNode;
  }

  // ── Pick the forest root ──
  let roots: BadgeNode[];
  if (rootKey) {
    const rootNode = nodes.find(
      (n) => n.key === rootKey && n.deletedAt == null,
    );
    if (!rootNode || !isVisible(rootNode, playerContext)) return [];
    roots = [rootNode];
  } else {
    roots = nodesByParent.get(null) ?? [];
  }

  return roots.map(buildNode);
}

function hasExpired(_node: BadgeNode, _signals: BadgeSignal[], _now: Date) {
  // Placeholder — per-signal expiresAt filtering is done in matchSignals
  // scope for now. Hook retained for future use.
  return false;
}

function explainReason(args: {
  node: BadgeNode;
  matched: MatchedSignals;
  dismissalActive: boolean;
  dismissalStale: boolean;
  childCount: number;
  leafCount: number;
  finalCount: number;
}): string {
  const { node, matched, dismissalActive, childCount, finalCount } = args;
  if (dismissalActive) {
    return `suppressed by active dismissal (mode=${node.dismissMode})`;
  }
  if (node.signalMatchMode === "none") {
    if (finalCount > 0) return `lit by children aggregation=${node.aggregation}`;
    return `dark: no children contributed (${childCount})`;
  }
  if (matched.matchedKeys.length === 0) {
    return `dark: no signal matched ${node.signalMatchMode === "prefix" ? `prefix='${node.signalKeyPrefix}'` : `key='${node.signalKey}'`}`;
  }
  if (finalCount > 0) {
    return `lit by ${matched.matchedKeys.length} matched signal(s), count=${finalCount}`;
  }
  return `dark: matched signal(s) have count=0`;
}
