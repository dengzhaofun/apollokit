import { describe, expect, test } from "vitest";

import { buildToolsForSurface } from "./tools";
import type { AdminSurface, ChatExecutionContext } from "./types";

const FAKE_CTX: ChatExecutionContext = { organizationId: "org-test" };

const BASE_TOOLS = [
  "askClarification",
  "navigateTo",
  "searchDocs",
  "readDoc",
  "queryModule",
  "describeConfig",
  "analyzeActivity",
];

describe("buildToolsForSurface", () => {
  test("dashboard exposes base tools (no apply*)", () => {
    const tools = buildToolsForSurface("dashboard", FAKE_CTX);
    expect(Object.keys(tools).sort()).toEqual([...BASE_TOOLS].sort());
  });

  test("check-in:list exposes base tools only (no apply* on list pages)", () => {
    const tools = buildToolsForSurface("check-in:list", FAKE_CTX);
    expect(Object.keys(tools).sort()).toEqual([...BASE_TOOLS].sort());
  });

  test("check-in:create exposes base tools + applyCheckInConfig", () => {
    const tools = buildToolsForSurface("check-in:create", FAKE_CTX);
    expect(Object.keys(tools).sort()).toEqual(
      [...BASE_TOOLS, "applyCheckInConfig"].sort(),
    );
  });

  test("check-in:edit matches :create", () => {
    const create = Object.keys(buildToolsForSurface("check-in:create", FAKE_CTX)).sort();
    const edit = Object.keys(buildToolsForSurface("check-in:edit", FAKE_CTX)).sort();
    expect(edit).toEqual(create);
  });

  test("every registered apply module gets its apply tool on :create", () => {
    // Sanity: each newly-registered module's :create surface should
    // surface its apply tool. Pulled from the apply-registry spec.
    const cases: Array<{ surface: AdminSurface; toolName: string }> = [
      { surface: "announcement:create", toolName: "applyAnnouncementConfig" },
      { surface: "assist-pool:create", toolName: "applyAssistPoolConfig" },
      { surface: "badge:create", toolName: "applyBadgeNodeConfig" },
      { surface: "banner:create", toolName: "applyBannerConfig" },
      { surface: "cdkey:create", toolName: "applyCdkeyBatch" },
      { surface: "character:create", toolName: "applyCharacterConfig" },
      { surface: "currency:create", toolName: "applyCurrencyDefinition" },
      { surface: "leaderboard:create", toolName: "applyLeaderboardConfig" },
      { surface: "lottery:create", toolName: "applyLotteryConfig" },
      { surface: "mail:create", toolName: "applyMailConfig" },
      { surface: "rank:create", toolName: "applyRankConfig" },
      { surface: "shop:create", toolName: "applyShopProductConfig" },
      { surface: "team:create", toolName: "applyTeamConfig" },
    ];
    for (const { surface, toolName } of cases) {
      const tools = buildToolsForSurface(surface, FAKE_CTX);
      expect(Object.keys(tools)).toContain(toolName);
    }
  });

  test("modules without an apply tool registered (e.g. activity) get only base tools on :create", () => {
    // activity is in ADMIN_MODULES but not in APPLY_TOOL_BY_MODULE.
    const tools = buildToolsForSurface("activity:create", FAKE_CTX);
    const applyTools = Object.keys(tools).filter((n) => n.startsWith("apply"));
    expect(applyTools).toEqual([]);
  });

  test("dashboard does NOT expose any apply* tool", () => {
    const tools = buildToolsForSurface("dashboard", FAKE_CTX);
    for (const name of Object.keys(tools)) {
      expect(name.startsWith("apply")).toBe(false);
    }
  });
});
