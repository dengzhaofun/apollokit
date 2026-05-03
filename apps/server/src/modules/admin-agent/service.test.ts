import type { UIMessage } from "ai";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { describe, expect, test } from "vitest";

import type { AIProvider } from "../../lib/ai";
import { registerMention } from "./mentions/registry";
import type { MentionDescriptor } from "./mentions/types";
import { createAdminAgentService } from "./service";
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

const EXEC_CTX: ChatExecutionContext = { tenantId: "org-test" };

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
 * text-only response. Enough to drive the agent end-to-end without
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

/**
 * Drain a streaming Response so the underlying mock model is actually
 * invoked. `Response.text()` reads the body to completion — the SSE
 * payload itself we don't care about, only the side-effect on the mock.
 */
async function drain(response: Response): Promise<void> {
  await response.text();
}

describe("createAdminAgentService", () => {
  test("form-fill on check-in:create forwards system prompt + applyCheckInConfig", async () => {
    const model = new MockLanguageModelV3({
      doStream: async () => textOnlyStreamResult("ok"),
    });
    const svc = createAdminAgentService({ ai: mockAi(model) });

    const response = await svc.streamChat(
      {
        messages: [sampleUserMessage],
        agentName: "form-fill",
        context: { surface: "check-in:create" },
      },
      EXEC_CTX,
    );
    await drain(response);

    expect(model.doStreamCalls.length).toBe(1);
    const call = model.doStreamCalls[0]!;

    const sysMsg = call.prompt.find((m) => m.role === "system");
    expect(sysMsg).toBeDefined();
    const sysText =
      typeof sysMsg!.content === "string"
        ? sysMsg!.content
        : JSON.stringify(sysMsg!.content);
    // form-fill identity + check-in module sub-prompt + apply tool name
    expect(sysText).toContain("form-fill");
    expect(sysText).toContain("签到模块");
    expect(sysText).toContain("applyCheckInConfig");

    const toolNames = (call.tools ?? []).map((t) => t.name).sort();
    expect(toolNames).toContain("applyCheckInConfig");
    expect(toolNames).toContain("askClarification");
    expect(toolNames).toContain("queryModule");
  });

  test("form-fill on dashboard does NOT register apply* tools", async () => {
    const model = new MockLanguageModelV3({
      doStream: async () => textOnlyStreamResult("ok"),
    });
    const svc = createAdminAgentService({ ai: mockAi(model) });

    const response = await svc.streamChat(
      {
        messages: [sampleUserMessage],
        agentName: "form-fill",
        context: { surface: "dashboard" },
      },
      EXEC_CTX,
    );
    await drain(response);

    const call = model.doStreamCalls[0]!;
    const toolNames = (call.tools ?? []).map((t) => t.name);
    expect(toolNames.some((n) => n.startsWith("apply"))).toBe(false);
    expect(toolNames).toContain("askClarification");
    expect(toolNames).toContain("queryModule");
  });

  test("form-fill: draft is forwarded into the system prompt", async () => {
    const model = new MockLanguageModelV3({
      doStream: async () => textOnlyStreamResult("ok"),
    });
    const svc = createAdminAgentService({ ai: mockAi(model) });

    const response = await svc.streamChat(
      {
        messages: [sampleUserMessage],
        agentName: "form-fill",
        context: {
          surface: "check-in:create",
          draft: { name: "Daily", resetMode: "week" },
        },
      },
      EXEC_CTX,
    );
    await drain(response);

    const call = model.doStreamCalls[0]!;
    const sysMsg = call.prompt.find((m) => m.role === "system");
    const sysText =
      typeof sysMsg!.content === "string"
        ? sysMsg!.content
        : JSON.stringify(sysMsg!.content);
    expect(sysText).toContain("已经填了的字段");
    expect(sysText).toContain("Daily");
  });

  test("form-fill mention path: snapshot in prompt + propose-only patch tool", async () => {
    // Register a fake check-in mention descriptor that maps to the
    // "check-in" patch-tool module. Avoid the real db-backed descriptor —
    // a fake tenantId would return null. This isolates the chat
    // wiring from the DB layer.
    const fakeDescriptor: MentionDescriptor = {
      type: "check-in",
      label: "签到配置",
      toolModuleId: "check-in",
      async search() {
        return [];
      },
      async fetch(orgId, id) {
        return { id, tenantId: orgId, name: "七日签到" };
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

    const response = await svc.streamChat(
      {
        messages: [sampleUserMessage],
        agentName: "form-fill",
        // dashboard surface so apply tool comes ONLY from the mention path,
        // not the surface-bound `:create` rule. Form-fill also exposes
        // apply on mention; global-assistant doesn't (see below).
        context: {
          surface: "dashboard",
          mentions: [{ type: "check-in", id: "cfg_abc" }],
        },
      },
      EXEC_CTX,
    );
    await drain(response);

    const call = model.doStreamCalls[0]!;
    const sysMsg = call.prompt.find((m) => m.role === "system");
    const sysText =
      typeof sysMsg!.content === "string"
        ? sysMsg!.content
        : JSON.stringify(sysMsg!.content);

    expect(sysText).toContain("当前对话引用的资源");
    expect(sysText).toContain("七日签到");
    expect(sysText).toContain("cfg_abc");

    const toolNames = (call.tools ?? []).map((t) => t.name);
    expect(toolNames).toContain("patchCheckInConfig");
  });

  test("form-fill mention with deleted resource: system shows '已失效'", async () => {
    const ghostDescriptor: MentionDescriptor = {
      type: "check-in",
      label: "签到配置",
      toolModuleId: "check-in",
      async search() {
        return [];
      },
      async fetch() {
        return null; // deleted between popover-select and submit
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

    const response = await svc.streamChat(
      {
        messages: [sampleUserMessage],
        agentName: "form-fill",
        context: {
          surface: "dashboard",
          mentions: [{ type: "check-in", id: "deleted_id" }],
        },
      },
      EXEC_CTX,
    );
    await drain(response);

    const call = model.doStreamCalls[0]!;
    const sysMsg = call.prompt.find((m) => m.role === "system");
    const sysText =
      typeof sysMsg!.content === "string"
        ? sysMsg!.content
        : JSON.stringify(sysMsg!.content);
    expect(sysText).toContain("已失效");
    // Even with a missing snapshot, descriptor.toolModuleId still
    // triggers tool registration so the agent can attempt to read.
    const toolNames = (call.tools ?? []).map((t) => t.name);
    expect(toolNames).toContain("patchCheckInConfig");
  });

  test("global-assistant on dashboard: identity + propose-then-confirm behavior", async () => {
    const model = new MockLanguageModelV3({
      doStream: async () => textOnlyStreamResult("ok"),
    });
    const svc = createAdminAgentService({ ai: mockAi(model) });

    const response = await svc.streamChat(
      {
        messages: [sampleUserMessage],
        agentName: "global-assistant",
        context: { surface: "dashboard" },
      },
      EXEC_CTX,
    );
    await drain(response);

    const call = model.doStreamCalls[0]!;
    const sysMsg = call.prompt.find((m) => m.role === "system");
    const sysText =
      typeof sysMsg!.content === "string"
        ? sysMsg!.content
        : JSON.stringify(sysMsg!.content);
    expect(sysText).toContain("global-assistant");
    // Patch tool propose-only safety net: prompt advertises that as the
    // load-bearing rule (not "directly writes to db" anymore — that was
    // unsafe with current model trust levels).
    expect(sysText).toContain("不会直接写库");

    // Apply tools intentionally NOT exposed under global-assistant.
    const toolNames = (call.tools ?? []).map((t) => t.name);
    expect(toolNames.some((n) => n.startsWith("apply"))).toBe(false);
  });

  test("returns a Response with an SSE content-type", async () => {
    const model = new MockLanguageModelV3({
      doStream: async () => textOnlyStreamResult("hello"),
    });
    const svc = createAdminAgentService({ ai: mockAi(model) });

    const response = await svc.streamChat(
      {
        messages: [sampleUserMessage],
        agentName: "form-fill",
        context: { surface: "check-in:create" },
      },
      EXEC_CTX,
    );
    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get("content-type")).toMatch(/event-stream/);
    await drain(response);
  });
});
