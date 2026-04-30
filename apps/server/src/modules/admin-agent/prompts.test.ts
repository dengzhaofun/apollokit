import { describe, expect, test } from "vitest";

import {
  buildFormFillSystemPrompt,
  buildGlobalAssistantSystemPrompt,
  buildMentionSystemSection,
} from "./prompts";

import type { MentionSnapshot } from "./mentions/types";

const NO_MENTIONS: { mentions: MentionSnapshot[]; locale: "zh" | "en" } = {
  mentions: [],
  locale: "zh",
};

describe("buildFormFillSystemPrompt", () => {
  test("dashboard surface gets identity + form-fill behavior + query mode", async () => {
    const prompt = await buildFormFillSystemPrompt({
      surface: "dashboard",
      ...NO_MENTIONS,
    });
    expect(prompt).toContain("ApolloKit 管理后台 agent");
    expect(prompt).toContain("form-fill");
    expect(prompt).not.toContain("签到模块");
  });

  test("check-in:create includes the check-in sub-prompt + form-fill behavior", async () => {
    const prompt = await buildFormFillSystemPrompt({
      surface: "check-in:create",
      ...NO_MENTIONS,
    });
    expect(prompt).toContain("ApolloKit 管理后台 agent");
    expect(prompt).toContain("form-fill");
    expect(prompt).toContain("签到模块");
    expect(prompt).toContain("applyCheckInConfig");
    expect(prompt).toContain("resetMode='week'");
  });

  test("check-in:edit also includes the check-in sub-prompt", async () => {
    const prompt = await buildFormFillSystemPrompt({
      surface: "check-in:edit",
      ...NO_MENTIONS,
    });
    expect(prompt).toContain("签到模块");
  });

  // The draft block is identified by its unique header "已经填了的字段"
  // so the assertion isn't fooled by base-prompt mentions of "draft".
  const DRAFT_MARKER = "已经填了的字段";

  test("draft snapshot is appended when non-empty", async () => {
    const prompt = await buildFormFillSystemPrompt({
      surface: "check-in:create",
      draft: { name: "Daily", resetMode: "week" },
      ...NO_MENTIONS,
    });
    expect(prompt).toContain(DRAFT_MARKER);
    expect(prompt).toContain("Daily");
    expect(prompt).toContain("week");
  });

  test("empty draft is NOT appended (avoids noisy '{}' in prompt)", async () => {
    const prompt = await buildFormFillSystemPrompt({
      surface: "check-in:create",
      draft: {},
      ...NO_MENTIONS,
    });
    expect(prompt).not.toContain(DRAFT_MARKER);
  });

  test("undefined draft is NOT appended", async () => {
    const prompt = await buildFormFillSystemPrompt({
      surface: "check-in:create",
      ...NO_MENTIONS,
    });
    expect(prompt).not.toContain(DRAFT_MARKER);
  });
});

describe("buildGlobalAssistantSystemPrompt", () => {
  test("dashboard surface emphasizes propose-then-confirm behavior", async () => {
    const prompt = await buildGlobalAssistantSystemPrompt({
      surface: "dashboard",
      ...NO_MENTIONS,
    });
    expect(prompt).toContain("ApolloKit 管理后台 agent");
    expect(prompt).toContain("global-assistant");
    // Reflect the safety net: patches are proposals, not direct writes.
    expect(prompt).toContain("不会直接写库");
  });

  test("global-assistant prompt explicitly forbids over-modifying patch", async () => {
    const prompt = await buildGlobalAssistantSystemPrompt({
      surface: "dashboard",
      ...NO_MENTIONS,
    });
    expect(prompt).toContain("只放用户明确要改的字段");
  });
});

describe("buildMentionSystemSection", () => {
  test("returns null on empty input", () => {
    expect(buildMentionSystemSection([])).toBeNull();
  });

  test("composes header + bullet lines", () => {
    const text = buildMentionSystemSection([
      {
        ref: { type: "check-in", id: "a" },
        resource: {},
        contextLine: "[check-in] line A",
        toolModuleId: "check-in",
      },
      {
        ref: { type: "task", id: "b" },
        resource: {},
        contextLine: "[task] line B",
        toolModuleId: null,
      },
    ])!;
    expect(text).toContain("当前对话引用的资源");
    expect(text).toContain("- [check-in] line A");
    expect(text).toContain("- [task] line B");
  });
});
