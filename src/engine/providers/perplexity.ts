import { PERPLEXITY_API_KEY, PRICING, systemPromptFor } from "../config";
import { fetchWithRetry } from "./http";
import type { Provider, ProviderRequest, ProviderResponse } from "./types";
import { ProviderError } from "./types";

const PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions";

interface SearchResult {
  title?: string;
  url: string;
}

interface PerplexityResponse {
  model: string;
  choices: { message: { content: string } }[];
  usage?: { prompt_tokens: number; completion_tokens: number };
  citations?: string[];
  search_results?: SearchResult[];
}

/**
 * Sonar always grounds its answers in live web search — there's no separate
 * on/off switch like the other providers, so `req.webSearch` only controls
 * how much search context we pay for (cost scales with context size).
 */
export function createPerplexityProvider(model: string): Provider {
  return {
    id: "perplexity",
    isConfigured(): boolean {
      return PERPLEXITY_API_KEY.length > 0;
    },
    async run(req: ProviderRequest): Promise<ProviderResponse> {
      const start = Date.now();
      const body = {
        model,
        messages: [
          { role: "system", content: systemPromptFor(req.location) },
          { role: "user", content: req.prompt },
        ],
        web_search_options: { search_context_size: "low" },
      };

      let res: Response;
      try {
        res = await fetchWithRetry(PERPLEXITY_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
      } catch (err) {
        throw new ProviderError("perplexity", `Perplexity call failed: ${String(err)}`, err);
      }

      const json = (await res.json()) as PerplexityResponse;
      const text = json.choices?.[0]?.message?.content ?? "";

      const citations =
        json.search_results && json.search_results.length > 0
          ? json.search_results.map((r) => ({ url: r.url, title: r.title }))
          : (json.citations ?? []).map((url) => ({ url }));

      const inputTokens = json.usage?.prompt_tokens ?? Math.round(req.prompt.length / 4);
      const outputTokens = json.usage?.completion_tokens ?? Math.round(text.length / 4);
      const tokenCost =
        (inputTokens / 1_000_000) * PRICING.perplexity.inputPerM +
        (outputTokens / 1_000_000) * PRICING.perplexity.outputPerM;
      const requestFee = PRICING.perplexity.perRequestUsd ?? 0;

      return {
        engine: "perplexity",
        model: json.model ?? model,
        text,
        citations,
        usage: { inputTokens, outputTokens, costUsd: tokenCost + requestFee },
        latencyMs: Date.now() - start,
        raw: json,
      };
    },
  };
}
