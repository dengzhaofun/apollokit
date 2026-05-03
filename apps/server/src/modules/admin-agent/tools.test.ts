import { describe, expect, test } from "vitest";

import {
  buildApplyTool,
  buildBaseTools,
  buildPatchTools,
} from "./tools";
import type { AdminSurface, ChatExecutionContext } from "./types";

const FAKE_CTX: ChatExecutionContext = { tenantId: "org-test" };

const BASE_TOOL_NAMES = [
  "askClarification",
  "navigateTo",
  "searchDocs",
  "readDoc",
  "queryModule",
  "describeConfig",
  "analyzeActivity",
];

describe("buildBaseTools", () => {
  test("exposes every always-on tool", () => {
    const tools = buildBaseTools(FAKE_CTX);
    expect(Object.keys(tools).sort()).toEqual([...BASE_TOOL_NAMES].sort());
  });
});

describe("buildApplyTool", () => {
  test("dashboard returns no apply tool", () => {
    expect(Object.keys(buildApplyTool("dashboard"))).toEqual([]);
  });

  test("check-in:list returns no apply tool (list is not a form surface)", () => {
    expect(Object.keys(buildApplyTool("check-in:list"))).toEqual([]);
  });

  test("check-in:create exposes applyCheckInConfig", () => {
    expect(Object.keys(buildApplyTool("check-in:create"))).toEqual([
      "applyCheckInConfig",
    ]);
  });

  test("check-in:edit matches :create", () => {
    expect(Object.keys(buildApplyTool("check-in:edit"))).toEqual(
      Object.keys(buildApplyTool("check-in:create")),
    );
  });

  test("every registered apply module surfaces its apply tool on :create", () => {
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
      expect(Object.keys(buildApplyTool(surface))).toContain(toolName);
    }
  });

  test("modules without an apply tool registered (e.g. activity) return no apply tool", () => {
    expect(Object.keys(buildApplyTool("activity:create"))).toEqual([]);
  });
});

describe("buildPatchTools", () => {
  test("returns nothing when no modules supplied", () => {
    expect(Object.keys(buildPatchTools([], "propose"))).toEqual([]);
    expect(Object.keys(buildPatchTools([], "execute"))).toEqual([]);
  });

  test("'propose' variant has no execute (form-fill flow)", () => {
    const tools = buildPatchTools(["check-in"], "propose");
    expect(Object.keys(tools)).toContain("patchCheckInConfig");
    expect("execute" in tools.patchCheckInConfig!).toBe(false);
  });

  test("'execute' variant has execute (global-assistant flow)", () => {
    const tools = buildPatchTools(["check-in"], "execute");
    expect(Object.keys(tools)).toContain("patchCheckInConfig");
    expect(typeof (tools.patchCheckInConfig as { execute?: unknown }).execute).toBe(
      "function",
    );
  });

  test("unknown module ids are silently dropped", () => {
    const tools = buildPatchTools(["check-in", "no-such-module"], "propose");
    expect(Object.keys(tools)).toEqual(["patchCheckInConfig"]);
  });

  test("all 7 patch-registered modules round-trip through both variants", () => {
    const modules = [
      "activity",
      "announcement",
      "character",
      "check-in",
      "dialogue",
      "item",
      "task",
    ];
    const propose = buildPatchTools(modules, "propose");
    const execute = buildPatchTools(modules, "execute");
    expect(Object.keys(propose).length).toBe(7);
    expect(Object.keys(execute).length).toBe(7);
    // Same wire names across variants — frontend renders by name.
    expect(Object.keys(propose).sort()).toEqual(Object.keys(execute).sort());
  });
});
