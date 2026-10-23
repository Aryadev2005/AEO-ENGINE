import {
  GEMINI_API_KEY,
  GEMINI_GROUNDING_USD_PER_1K_QUERIES,
  PRICING,
  systemPromptFor,
} from "../config";
import { fetchWithRetry } from "./http";
import type { Provider, ProviderCitation, ProviderRequest, ProviderResponse } from "./types";
import { ProviderError } from "./types";

const GEMINI_INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";

interface UrlCitationAnnotation {
  type: "url_citation";
  url: string;
  title?: string;
}

interface TextBlock {
  type: "text";
  text: string;
  annotations?: UrlCitationAnnotation[];
}

interface InteractionStep {
  type: string;
  content?: TextBlock[];
  arguments?: { queries?: string[] };
}

interface InteractionsResponse {
  model?: string;
  steps: InteractionStep[];
  // Confirmed against the live API — not "input_tokens"/"output_tokens" as
  // the field names might suggest. Thinking-enabled models like gemini-3.8-flash
  // bill thought tokens as generated output, so they're counted as output here too.
  usage?: {
    total_input_tokens?: number;
    total_output_tokens?: number;
    total_thought_tokens?: number;
  };
}

/**
 * Gemini's Google Search grounding now runs through the Interactions API
 * (replaced the older generateContent "googleSearchRetrieval" tool in 2026).
 * Citations come back as `url_citation` annotations on model_output text blocks.
 */
export function createGeminiProvider(model: string): Provider {
  return {
    id: "gemini",
    isConfigured(): boolean {
      return GEMINI_API_KEY.length > 0;
    },
    async run(req: ProviderRequest): Promise<ProviderResponse> {
      const start = Date.now();
      // The Interactions API has no separate system-instructions field (a
      // request with "instructions" is rejected with 400 invalid_request,
      // confirmed against the live API) — fold it into "input" instead.
      const body = {
        model,
        input: `${systemPromptFor(req.location)}\n\n${req.prompt}`,
        ...(req.webSearch ? { tools: [{ type: "google_search" }] } : {}),
      };

      let res: Response;
      try {
        res = await fetchWithRetry(`${GEMINI_INTERACTIONS_URL}?key=${GEMINI_API_KEY}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch (err) {
        throw new ProviderError("gemini", `Gemini call failed: ${String(err)}`, err);
      }

      const json = (await res.json()) as InteractionsResponse;

      const textBlocks: TextBlock[] = [];
      let numQueries = 0;
      for (const step of json.steps ?? []) {
        if (step.type === "google_search_call") {
          numQueries += step.arguments?.queries?.length ?? 1;
        }
        if (step.type === "model_output") {
          for (const block of step.content ?? []) {
            if (block.type === "text") textBlocks.push(block);
          }
        }
      }

      const text = textBlocks.map((b) => b.text).join("\n");
      const citations = dedupeCitations(
        textBlocks.flatMap((b) =>
          (b.annotations ?? [])
            .filter((a) => a.type === "url_citation")
            .map((a) => ({ url: a.url, title: a.title })),
        ),
      );

      const inputTokens = json.usage?.total_input_tokens ?? Math.round(req.prompt.length / 4);
      const outputTokens =
        json.usage?.total_output_tokens !== undefined
          ? json.usage.total_output_tokens + (json.usage.total_thought_tokens ?? 0)
          : Math.round(text.length / 4);
      const tokenCost =
        (inputTokens / 1_000_000) * PRICING.gemini.inputPerM +
        (outputTokens / 1_000_000) * PRICING.gemini.outputPerM;
      const groundingCost = (numQueries / 1000) * GEMINI_GROUNDING_USD_PER_1K_QUERIES;

      return {
        engine: "gemini",
        model: json.model ?? model,
        text,
        citations,
        usage: { inputTokens, outputTokens, costUsd: tokenCost + groundingCost },
        latencyMs: Date.now() - start,
        raw: json,
      };
    },
  };
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
