import { env } from "cloudflare:workers";
import {
  createOpenRouter,
  type OpenRouterProvider,
} from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";

export type AIProvider = {
  /** Returns a chat LanguageModel for the given OpenRouter model id. */
  model: (modelId?: string) => LanguageModel;
  /** Raw OpenRouter provider — for chat/completion/embedding factories or BYOK headers. */
  raw: () => OpenRouterProvider;
};

const DEFAULT_MODEL = "openai/gpt-4o-mini";

export function createAIProvider(): AIProvider {
  let provider: OpenRouterProvider | null = null;
  function resolve(): OpenRouterProvider {
    if (!provider) {
      provider = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });
    }
    return provider;
  }
  return {
    model: (modelId = DEFAULT_MODEL) => resolve().chat(modelId),
    raw: () => resolve(),
  };
}
