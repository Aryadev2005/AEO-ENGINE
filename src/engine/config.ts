import type { EngineId } from "./providers/types";

function env(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return v === "true" || v === "1";
}

function envNum(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Model ids live here, not in adapter code, so a pricier model swap is a
 * one-line config change. Defaults below were current as of Oct 2026 — check
 * each provider's docs before relying on them in production (see README).
 */
export const MODELS = {
  chatgpt: env("MODEL_CHATGPT", "openai/gpt-4o-mini"),
  claude: env("MODEL_CLAUDE", "anthropic/claude-haiku-4.5"),
  // Flash-Lite over the full Flash model: ~3x/2.5x cheaper (confirmed against
  // ai.google.dev/gemini-api/docs/pricing) with identical Interactions API +
  // Google Search grounding support — verified against the live API.
  gemini: env("MODEL_GEMINI", "gemini-3.1-flash-lite"),
  perplexity: env("MODEL_PERPLEXITY", "sonar"),
  utility: env("MODEL_UTILITY", "openai/gpt-4o-mini"),
};

/**
 * Per-million-token USD prices, used only to estimate/cap spend before a
 * scan runs and to log actual cost after. These are approximations — verify
 * against each provider's current pricing page when real money is on the line.
 */
export const PRICING: Record<
  EngineId,
  { inputPerM: number; outputPerM: number; perRequestUsd?: number }
> = {
  chatgpt: { inputPerM: 0.15, outputPerM: 0.6 },
  claude: { inputPerM: 1.0, outputPerM: 5.0 },
  // gemini-3.1-flash-lite, confirmed against ai.google.dev/gemini-api/docs/pricing
  // (Oct 2026; rises to $0.50/$3.00 on 2027-01-01 per that page).
  gemini: { inputPerM: 0.25, outputPerM: 1.5 },
  perplexity: { inputPerM: 1.0, outputPerM: 1.0, perRequestUsd: 0.005 },
  mock: { inputPerM: 0, outputPerM: 0 },
};

/** OpenRouter's web search plugin bills per 1,000 web results fetched, 5 by default. */
export const OPENROUTER_WEB_SEARCH_USD_PER_1K_RESULTS = 4;
export const OPENROUTER_WEB_SEARCH_DEFAULT_RESULTS = 5;

/** Gemini's Google Search grounding tool bills per 1,000 search queries the model runs. */
export const GEMINI_GROUNDING_USD_PER_1K_QUERIES = 14;

export const OPENROUTER_API_KEY = env("OPENROUTER_API_KEY");
export const GEMINI_API_KEY = env("GEMINI_API_KEY");
export const PERPLEXITY_API_KEY = env("PERPLEXITY_API_KEY");
export const LLM_MOCK_MODE = envBool("LLM_MOCK_MODE", false);

export const ENABLE_LLM_EXTRACTION = envBool("ENABLE_LLM_EXTRACTION", true);

export const GOOGLE_PLACES_API_KEY = env("GOOGLE_PLACES_API_KEY");

export const CHECKER_DAILY_USD_CAP = envNum("CHECKER_DAILY_USD_CAP", 2);
export const CHECKER_PER_IP_PER_DAY = envNum("CHECKER_PER_IP_PER_DAY", 3);

export const DEFAULT_MONTHLY_BUDGET_USD: Record<
  "free" | "starter" | "growth" | "agency",
  number
> = {
  free: 1,
  starter: 5,
  growth: 20,
  agency: 50,
};

/** How long an identical (prompt, engine, location) result is reused instead of re-called. */
export const SCAN_RESULT_CACHE_HOURS = 24;
export const CHECKER_RESULT_CACHE_DAYS = 7;

/** Max concurrent in-flight calls per provider. */
export const PROVIDER_CONCURRENCY = envNum("PROVIDER_CONCURRENCY", 4);
export const PROVIDER_MAX_RETRIES = 3;
export const PROVIDER_TIMEOUT_MS = 60_000;

/** Weights for the 0–100 headline AI Visibility Score. Must sum to 1. */
export const SCORE_WEIGHTS = {
  visibility: 0.5,
  position: 0.2,
  shareOfVoice: 0.2,
  citationShare: 0.1,
  sentiment: 0.0, // reserved; sentiment is reported separately, not yet blended into the headline score
};

/** Position score: 100 at position 1, decaying linearly to 0 at position 10+. */
export function positionScore(position: number | null): number {
  if (position === null || position < 1) return 0;
  if (position >= 10) return 0;
  return Math.round(100 * (1 - (position - 1) / 9));
}

export function systemPromptFor(location?: string): string {
  const loc = location ?? "the user's region";
  return `You are a helpful assistant answering a user's question. The user is located in ${loc}.
Answer naturally as you would for any user. When recommending businesses, products or services,
name specific options. Cite sources when you use them.`;
}

// A single grounded Gemini call can issue several search queries in one
// interaction (observed up to 4 for a moderately specific prompt against the
// live API) — budget estimates assume this many rather than 1, so the
// pre-scan estimate doesn't undercount actual spend.
const GEMINI_AVG_QUERIES_PER_CALL = 3;

export function estimateCallCostUsd(
  engine: EngineId,
  avgInputTokens = 300,
  avgOutputTokens = 600,
): number {
  const p = PRICING[engine];
  const tokenCost =
    (avgInputTokens / 1_000_000) * p.inputPerM +
    (avgOutputTokens / 1_000_000) * p.outputPerM;
  const requestFee = p.perRequestUsd ?? 0;
  const extra =
    engine === "chatgpt" || engine === "claude"
      ? (OPENROUTER_WEB_SEARCH_DEFAULT_RESULTS / 1000) *
        OPENROUTER_WEB_SEARCH_USD_PER_1K_RESULTS
      : engine === "gemini"
        ? (GEMINI_AVG_QUERIES_PER_CALL / 1000) * GEMINI_GROUNDING_USD_PER_1K_QUERIES
        : 0;
  return tokenCost + requestFee + extra;
}
