import type { UIMessage } from "ai";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { describe, expect, test } from "vitest";

import type { AIProvider } from "../../lib/ai";
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
