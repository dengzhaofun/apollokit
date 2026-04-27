import { describe, expect, test } from "vitest";

import { buildSystemPrompt } from "./prompts";

describe("buildSystemPrompt", () => {
  test("dashboard surface gets only the base prompt", async () => {
    const prompt = await buildSystemPrompt("dashboard");
    expect(prompt).toContain("ApolloKit 管理后台 agent");
    expect(prompt).not.toContain("签到模块");
  });

  test("check-in:create includes the check-in sub-prompt", async () => {
    const prompt = await buildSystemPrompt("check-in:create");
    expect(prompt).toContain("ApolloKit 管理后台 agent");
    expect(prompt).toContain("签到模块");
    expect(prompt).toContain("applyCheckInConfig");
    expect(prompt).toContain("resetMode='week'");
  });

  test("check-in:edit also includes the check-in sub-prompt", async () => {
    const prompt = await buildSystemPrompt("check-in:edit");
    expect(prompt).toContain("签到模块");
  });

  // The draft block is identified by its unique header "已经填了的字段"
  // so the assertion isn't fooled by base-prompt mentions of "draft".
  const DRAFT_MARKER = "已经填了的字段";

  test("draft snapshot is appended when non-empty", async () => {
    const prompt = await buildSystemPrompt("check-in:create", {
      name: "Daily",
      resetMode: "week",
    });
    expect(prompt).toContain(DRAFT_MARKER);
    expect(prompt).toContain("Daily");
    expect(prompt).toContain("week");
  });

  test("empty draft is NOT appended (avoids noisy '{}' in prompt)", async () => {
    const prompt = await buildSystemPrompt("check-in:create", {});
    expect(prompt).not.toContain(DRAFT_MARKER);
  });

  test("undefined draft is NOT appended", async () => {
    const prompt = await buildSystemPrompt("check-in:create");
    expect(prompt).not.toContain(DRAFT_MARKER);
  });
});
