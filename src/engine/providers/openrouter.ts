import {
  OPENROUTER_API_KEY,
  OPENROUTER_WEB_SEARCH_DEFAULT_RESULTS,
  OPENROUTER_WEB_SEARCH_USD_PER_1K_RESULTS,
  PRICING,
  systemPromptFor,
} from "../config";
import { fetchWithRetry } from "./http";
import type {
  EngineId,
  Provider,
  ProviderCitation,
  ProviderRequest,
  ProviderResponse,
} from "./types";
import { ProviderError } from "./types";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

interface OpenRouterAnnotation {
  type: string;
  url_citation?: { url: string; title?: string };
}

interface OpenRouterChoice {
  message: {
    role: string;
    content: string;
    annotations?: OpenRouterAnnotation[];
  };
  finish_reason?: string;
}

interface OpenRouterResponse {
  model: string;
  choices: OpenRouterChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    cost?: number; // present when request sent `usage: { include: true }`
  };
}

/**
 * One adapter covers both "ChatGPT" and "Claude" engine labels — both are
 * just different model slugs behind the same OpenRouter key. Web search
 * uses OpenRouter's web plugin (billed per 1,000 results, not per token).
 */
export function createOpenRouterProvider(
  engineId: EngineId,
  model: string,
): Provider {
  return {
    id: engineId,
    isConfigured(): boolean {
      return OPENROUTER_API_KEY.length > 0;
    },
    async run(req: ProviderRequest): Promise<ProviderResponse> {
      const start = Date.now();
      const body = {
        model,
        messages: [
          { role: "system", content: systemPromptFor(req.location) },
          { role: "user", content: req.prompt },
        ],
        usage: { include: true },
        ...(req.webSearch
          ? {
              plugins: [
                { id: "web", max_results: OPENROUTER_WEB_SEARCH_DEFAULT_RESULTS },
              ],
            }
          : {}),
      };

      let res: Response;
      try {
        res = await fetchWithRetry(OPENROUTER_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
      } catch (err) {
        throw new ProviderError(engineId, `OpenRouter call failed: ${String(err)}`, err);
      }

      const json = (await res.json()) as OpenRouterResponse;
      const choice = json.choices?.[0];
      const text = choice?.message?.content ?? "";
      const citations = extractCitations(text, choice?.message?.annotations);

      const inputTokens = json.usage?.prompt_tokens ?? 0;
      const outputTokens = json.usage?.completion_tokens ?? 0;
      const tokenCost =
        json.usage?.cost ??
        (inputTokens / 1_000_000) * PRICING[engineId].inputPerM +
          (outputTokens / 1_000_000) * PRICING[engineId].outputPerM;
      const searchCost = req.webSearch
        ? (OPENROUTER_WEB_SEARCH_DEFAULT_RESULTS / 1000) *
          OPENROUTER_WEB_SEARCH_USD_PER_1K_RESULTS
        : 0;

      return {
        engine: engineId,
        model: json.model ?? model,
        text,
        citations,
        usage: {
          inputTokens,
          outputTokens,
          costUsd: tokenCost + (json.usage?.cost !== undefined ? 0 : searchCost),
        },
        latencyMs: Date.now() - start,
        raw: json,
      };
    },
  };
}

function extractCitations(
  text: string,
  annotations?: OpenRouterAnnotation[],
): ProviderCitation[] {
  const fromAnnotations = (annotations ?? [])
    .filter((a) => a.type === "url_citation" && a.url_citation)
    .map((a) => ({ url: a.url_citation!.url, title: a.url_citation!.title }));
  if (fromAnnotations.length > 0) return dedupeCitations(fromAnnotations);

  const urlRegex = /https?:\/\/[^\s)\]]+/g;
  const found = text.match(urlRegex) ?? [];
  return dedupeCitations(found.map((url) => ({ url })));
}

function dedupeCitations(citations: ProviderCitation[]): ProviderCitation[] {
  const seen = new Set<string>();
  const out: ProviderCitation[] = [];
  for (const c of citations) {
    const key = c.url.replace(/\/$/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}
