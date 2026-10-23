import { LLM_MOCK_MODE, MODELS } from "../config";
import { createGeminiProvider } from "./gemini";
import { createMockProvider, type MockOptions } from "./mock";
import { createOpenRouterProvider } from "./openrouter";
import { createPerplexityProvider } from "./perplexity";
import type { EngineId, Provider } from "./types";

export type { EngineId, Provider, ProviderRequest, ProviderResponse } from "./types";
export { ProviderError } from "./types";

/**
 * Builds the full provider registry. In mock mode (or with zero keys
 * configured) every real engine is swapped for the deterministic mock so the
 * app works offline. Otherwise each real provider self-reports whether its
 * key is present via `isConfigured()`; the runner uses that to skip silently.
 */
export function buildProviders(mockOptions: MockOptions): Record<EngineId, Provider> {
  if (LLM_MOCK_MODE) {
    return allMock(mockOptions);
  }

  const real: Record<EngineId, Provider> = {
    chatgpt: createOpenRouterProvider("chatgpt", MODELS.chatgpt),
    claude: createOpenRouterProvider("claude", MODELS.claude),
    gemini: createGeminiProvider(MODELS.gemini),
    perplexity: createPerplexityProvider(MODELS.perplexity),
    mock: createMockProvider(mockOptions),
  };

  const anyConfigured = (["chatgpt", "claude", "gemini", "perplexity"] as const).some(
    (id) => real[id].isConfigured(),
  );
  return anyConfigured ? real : allMock(mockOptions);
}

function allMock(mockOptions: MockOptions): Record<EngineId, Provider> {
  return {
    chatgpt: createMockProvider(mockOptions, "chatgpt"),
    claude: createMockProvider(mockOptions, "claude"),
    gemini: createMockProvider(mockOptions, "gemini"),
    perplexity: createMockProvider(mockOptions, "perplexity"),
    mock: createMockProvider(mockOptions, "mock"),
  };
}

export const ALL_ENGINES: EngineId[] = ["chatgpt", "claude", "gemini", "perplexity"];
