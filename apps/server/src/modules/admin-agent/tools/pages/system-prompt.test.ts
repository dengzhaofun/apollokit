/**
 * System-prompt builder tests (PR 7).
 *
 * The prompt is the single biggest lever on agent behavior — these
 * tests catch regressions that would otherwise only show up when an
 * agent's quality drops in production.
 */

import { describe, expect, test } from "vitest";

import { buildPagesBuilderSystemPrompt } from "./system-prompt";

const projectFixture = {
  id: "p-1",
  name: "Spring Check-in",
  slug: "spring-checkin",
  authMode: "anonymous" as const,
  boundModules: ["check-in", "shop"],
  publishedVersionId: null,
};

describe("buildPagesBuilderSystemPrompt", () => {
  test("EN locale renders the EN rules header", () => {
    const prompt = buildPagesBuilderSystemPrompt({
      project: projectFixture,
      draftSchema: null,
      publishedVersionNumber: null,
      locale: "en",
    });
    expect(prompt).toContain("You are the Apollo Pages builder");
    expect(prompt).toContain("FULL PageProjectSchema");
  });

  test("ZH locale renders the ZH rules header", () => {
    const prompt = buildPagesBuilderSystemPrompt({
      project: projectFixture,
      draftSchema: null,
      publishedVersionNumber: null,
      locale: "zh",
    });
    expect(prompt).toContain("Apollo Pages 构建器");
    expect(prompt).toContain("完整 PageProjectSchema");
  });

  test("includes project context (slug / authMode / boundModules)", () => {
    const prompt = buildPagesBuilderSystemPrompt({
      project: projectFixture,
      draftSchema: null,
      publishedVersionNumber: null,
      locale: "en",
    });
    expect(prompt).toContain("spring-checkin");
    expect(prompt).toContain("anonymous");
    expect(prompt).toContain("check-in, shop");
  });

  test("renders '(empty — proposePageDraft will create v1)' when no draft", () => {
    const prompt = buildPagesBuilderSystemPrompt({
      project: projectFixture,
      draftSchema: null,
      publishedVersionNumber: null,
      locale: "en",
    });
    expect(prompt).toContain("empty");
    expect(prompt).toContain("proposePageDraft will create v1");
  });

  test("inlines the current draft schema as a JSON block", () => {
    const draft = {
      version: 1 as const,
      theme: { primary: "#FF6B35", bg: "#000", fg: "#fff" },
      pages: [
        {
          id: "home",
          path: "/",
          title: "Home",
          blocks: [
            { id: "hero-1", type: "hero", props: { title: "Hi" } },
          ],
        },
      ],
      defaultPageId: "home",
    };
    const prompt = buildPagesBuilderSystemPrompt({
      project: projectFixture,
      draftSchema: draft,
      publishedVersionNumber: 3,
      locale: "en",
    });
    expect(prompt).toContain('"id": "home"');
    expect(prompt).toContain('"hero-1"');
    expect(prompt).toContain("v3");
  });

  test("truncates very large draft schemas (>8K chars)", () => {
    const giantBlocks = Array.from({ length: 200 }, (_, i) => ({
      id: `b-${i}`,
      type: "hero",
      props: {
        title: `Block ${i}`,
        subtitle:
          "Lorem ipsum dolor sit amet ".repeat(20),
      },
    }));
    const giant = {
      version: 1 as const,
      theme: { primary: "#FF6B35", bg: "#000", fg: "#fff" },
      pages: [
        { id: "home", path: "/", title: "Home", blocks: giantBlocks },
      ],
      defaultPageId: "home",
    };
    const prompt = buildPagesBuilderSystemPrompt({
      project: projectFixture,
      draftSchema: giant,
      publishedVersionNumber: null,
      locale: "en",
    });
    expect(prompt).toContain("(truncated; full schema available");
  });

  test("lists every catalog block id in the prompt", () => {
    const prompt = buildPagesBuilderSystemPrompt({
      project: projectFixture,
      draftSchema: null,
      publishedVersionNumber: null,
      locale: "en",
    });
    for (const expected of [
      "hero",
      "feature-grid",
      "footer",
      "auth-form",
      "check-in-board",
      "shop-grid",
      "lottery-wheel",
      "cdkey-redeem",
      "leaderboard-card",
      "mail-inbox",
      "activity-form",
      "badge-wall",
    ]) {
      expect(prompt).toContain(expected);
    }
  });
});
