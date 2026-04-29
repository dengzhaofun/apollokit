import type { UIMessage } from "ai";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { describe, expect, test } from "vitest";

import type { AIProvider } from "../../lib/ai";
import { registerMention } from "./mentions/registry";
import type { MentionDescriptor, MentionSnapshot } from "./mentions/types";
import {
  buildMentionSystemSection,
  createAdminAgentService,
} from "./service";
import type { ChatExecutionContext } from "./types";

/**
 * The mock model's `doStream` return type is
 * `{ stream: ReadableStream<LanguageModelV3StreamPart> }`. We build the
 * stream from a typed-any array of v3 stream parts and cast the
 * resulting `ReadableStream<unknown>` to the precise type the mock
 * expects — the runtime shape is correct, only the generic narrows.
 */
type DoStreamResult = Awaited<
  ReturnType<NonNullable<MockLanguageModelV3["doStream"]>>
>;

const EXEC_CTX: ChatExecutionContext = { organizationId: "org-test" };

/**
 * Wrap a `MockLanguageModelV3` in the same `AIProvider` interface the
 * service expects, so we can swap it into the factory in place of the
 * real OpenRouter-backed provider.
 */
function mockAi(model: MockLanguageModelV3): AIProvider {
  return {
    model: () => model,
    raw: () => {
      throw new Error("raw() not used in admin-agent");
    },
  };
}

/**
 * Minimal stream of v3 LanguageModel events that produces a non-empty
 * text-only response. Enough to drive `streamText` end-to-end without
 * exercising any tool path — we just want to confirm the wiring works
 * and that the right system prompt + tools were passed to the model.
 */
function textOnlyStreamResult(text: string): DoStreamResult {
  const parts = [
    { type: "stream-start", warnings: [] },
    { type: "text-start", id: "t0" },
    { type: "text-delta", id: "t0", delta: text },
    { type: "text-end", id: "t0" },
    {
      type: "finish",
      finishReason: "stop",
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    },
  ];
  return {
    stream: simulateReadableStream({ chunks: parts }),
  } as DoStreamResult;
}

const sampleUserMessage: UIMessage = {
  id: "u1",
  role: "user",
  parts: [{ type: "text", text: "我要 7 日签到" }],
};

describe("createAdminAgentService", () => {
  test("forwards system prompt + tools for check-in:create surface", async () => {
    const model = new MockLanguageModelV3({
      doStream: async () => textOnlyStreamResult("ok"),
    });
    const svc = createAdminAgentService({ ai: mockAi(model) });

    const result = await svc.streamChat(
      {
        messages: [sampleUserMessage],
        context: { surface: "check-in:create" },
      },
      EXEC_CTX,
    );

    // Drain so the model is invoked.
    await result.consumeStream();

    expect(model.doStreamCalls.length).toBe(1);
    const call = model.doStreamCalls[0]!;

    // System message is passed as the first prompt entry.
    const sysMsg = call.prompt.find((m) => m.role === "system");
    expect(sysMsg).toBeDefined();
    const sysText =
      typeof sysMsg!.content === "string"
        ? sysMsg!.content
        : JSON.stringify(sysMsg!.content);
    expect(sysText).toContain("签到模块");
    expect(sysText).toContain("applyCheckInConfig");

    // Tools registered for this surface.
    const toolNames = (call.tools ?? []).map((t) => t.name).sort();
    expect(toolNames).toContain("applyCheckInConfig");
    expect(toolNames).toContain("askClarification");
    expect(toolNames).toContain("queryModule");
  });

  test("dashboard surface does NOT register apply* tools", async () => {
    const model = new MockLanguageModelV3({
      doStream: async () => textOnlyStreamResult("ok"),
    });
    const svc = createAdminAgentService({ ai: mockAi(model) });

    const result = await svc.streamChat(
      {
        messages: [sampleUserMessage],
        context: { surface: "dashboard" },
      },
      EXEC_CTX,
    );
    await result.consumeStream();

    const call = model.doStreamCalls[0]!;
    const toolNames = (call.tools ?? []).map((t) => t.name);
    expect(toolNames.some((n) => n.startsWith("apply"))).toBe(false);
    // Query tools and askClarification still present.
    expect(toolNames).toContain("askClarification");
    expect(toolNames).toContain("queryModule");
  });

  test("draft is forwarded into the system prompt", async () => {
    const model = new MockLanguageModelV3({
      doStream: async () => textOnlyStreamResult("ok"),
    });
    const svc = createAdminAgentService({ ai: mockAi(model) });

    const result = await svc.streamChat(
      {
        messages: [sampleUserMessage],
        context: {
          surface: "check-in:create",
          draft: { name: "Daily", resetMode: "week" },
        },
      },
      EXEC_CTX,
    );
    await result.consumeStream();

    const call = model.doStreamCalls[0]!;
    const sysMsg = call.prompt.find((m) => m.role === "system");
    const sysText =
      typeof sysMsg!.content === "string"
        ? sysMsg!.content
        : JSON.stringify(sysMsg!.content);
    expect(sysText).toContain("已经填了的字段");
    expect(sysText).toContain("Daily");
  });

  test("mentioned check-in resource: system prompt gets snapshot + apply tool joins toolset", async () => {
    // Register a fake check-in mention descriptor that maps to the
    // "check-in" apply-tool module. We deliberately don't go through
    // the real db-backed descriptor — fetching with a fake
    // organizationId would return null. This isolates the chat
    // wiring (system prompt + tool extension) from the DB layer.
    const fakeDescriptor: MentionDescriptor = {
      type: "check-in",
      label: "签到配置",
      toolModuleId: "check-in",
      async search() {
        return [];
      },
      async fetch(orgId, id) {
        return { id, organizationId: orgId, name: "七日签到" };
      },
      toResult(item) {
        const it = item as { id: string; name: string };
        return { type: "check-in", id: it.id, name: it.name };
      },
      toContextLine(item) {
        const it = item as { id: string; name: string };
        return `[check-in] 签到配置 "${it.name}" (id=${it.id}, status=active)`;
      },
    };
    registerMention(fakeDescriptor);

    const model = new MockLanguageModelV3({
      doStream: async () => textOnlyStreamResult("ok"),
    });
    const svc = createAdminAgentService({ ai: mockAi(model) });

    const result = await svc.streamChat(
      {
        messages: [sampleUserMessage],
        // dashboard surface so apply tool comes ONLY from the mention path,
        // not from the surface-bound `:create` rule.
        context: {
          surface: "dashboard",
          mentions: [{ type: "check-in", id: "cfg_abc" }],
        },
      },
      EXEC_CTX,
    );
    await result.consumeStream();

    const call = model.doStreamCalls[0]!;
    const sysMsg = call.prompt.find((m) => m.role === "system");
    const sysText =
      typeof sysMsg!.content === "string"
        ? sysMsg!.content
        : JSON.stringify(sysMsg!.content);

    // System prompt now contains the mention snapshot.
    expect(sysText).toContain("当前对话引用的资源");
    expect(sysText).toContain("七日签到");
    expect(sysText).toContain("cfg_abc");

    // Both apply and patch tools were injected by the mention path even
    // though we're on dashboard. The patch tool is the "modify the
    // existing resource" path; apply is the "create a similar one"
    // path. Both must be available so the LLM can pick the right one
    // based on user intent.
    const toolNames = (call.tools ?? []).map((t) => t.name);
    expect(toolNames).toContain("applyCheckInConfig");
    expect(toolNames).toContain("patchCheckInConfig");
  });

  test("mentioned resource that fetch() returns null: system shows '已失效'", async () => {
    const ghostDescriptor: MentionDescriptor = {
      type: "check-in",
      label: "签到配置",
      toolModuleId: "check-in",
      async search() {
        return [];
      },
      async fetch() {
        return null; // Resource was deleted between popover-select and submit.
      },
      toResult() {
        return { type: "check-in", id: "x", name: "x" };
      },
      toContextLine() {
        return "(should not be called)";
      },
    };
    registerMention(ghostDescriptor);

    const model = new MockLanguageModelV3({
      doStream: async () => textOnlyStreamResult("ok"),
    });
    const svc = createAdminAgentService({ ai: mockAi(model) });

    const result = await svc.streamChat(
      {
        messages: [sampleUserMessage],
        context: {
          surface: "dashboard",
          mentions: [{ type: "check-in", id: "deleted_id" }],
        },
      },
      EXEC_CTX,
    );
    await result.consumeStream();

    const call = model.doStreamCalls[0]!;
    const sysMsg = call.prompt.find((m) => m.role === "system");
    const sysText =
      typeof sysMsg!.content === "string"
        ? sysMsg!.content
        : JSON.stringify(sysMsg!.content);
    expect(sysText).toContain("已失效");
    // Even with a missing snapshot, the toolModuleId on the descriptor
    // still triggers tool registration — the agent can attempt to read
    // by id, the read endpoint will surface its own "not found".
    const toolNames = (call.tools ?? []).map((t) => t.name);
    expect(toolNames).toContain("applyCheckInConfig");
  });

  test("buildMentionSystemSection: returns null on empty input", () => {
    expect(buildMentionSystemSection([])).toBeNull();
  });

  test("buildMentionSystemSection: composes header + bullet lines", () => {
    const snapshots: MentionSnapshot[] = [
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
    ];
    const text = buildMentionSystemSection(snapshots)!;
    expect(text).toContain("当前对话引用的资源");
    expect(text).toContain("- [check-in] line A");
    expect(text).toContain("- [task] line B");
  });

  test("returns a stream that can be wrapped as a UI message stream response", async () => {
    const model = new MockLanguageModelV3({
      doStream: async () => textOnlyStreamResult("hello"),
    });
    const svc = createAdminAgentService({ ai: mockAi(model) });

    const result = await svc.streamChat(
      {
        messages: [sampleUserMessage],
        context: { surface: "check-in:create" },
      },
      EXEC_CTX,
    );

    const response = result.toUIMessageStreamResponse();
    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get("content-type")).toMatch(/event-stream/);
  });
});
