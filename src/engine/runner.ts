import pLimit from "p-limit";
import { ENABLE_LLM_EXTRACTION, estimateCallCostUsd, PROVIDER_CONCURRENCY } from "./config";
import { classifySource } from "./classify-source";
import { assertWithinBudget, type CostLedger } from "./cost";
import {
  extractPassA,
  extractPassB,
  findSuggestedCompetitors,
  type EntityMatch,
} from "./extract";
import { callUtilityModel } from "./llm-utility";
import { buildProviders } from "./providers";
import type { EngineId, ProviderCitation, ProviderResponse } from "./providers/types";
import { computeScoresByEngine, type ScoreInputResult, type ScoreOutput } from "./score";
import type { SourceType } from "./classify-source";

export interface BrandInput {
  name: string;
  aliases?: string[];
  website?: string;
  city?: string;
  country?: string;
}

export interface CompetitorRunnerInput {
  id: string;
  name: string;
  aliases?: string[];
  website?: string;
}

export interface PromptRunnerInput {
  id: string;
  text: string;
  intent?: "discovery" | "comparison" | "alternative" | "review" | "local";
}

/**
 * Lets a DB-backed caller reuse a result from the last 24h instead of
 * calling the provider again, per spec §5.1 step 3. The CLI (no DB) simply
 * omits this and every call goes live.
 */
export interface ScanCacheAdapter {
  get(input: { promptId: string; engine: EngineId }): Promise<ProviderResponse | null>;
}

export interface ScanOptions {
  brand: BrandInput;
  competitors: CompetitorRunnerInput[];
  prompts: PromptRunnerInput[];
  engines: EngineId[];
  webSearch?: boolean;
  budgetUsd?: number;
  workspaceId?: string | null;
  cache?: ScanCacheAdapter;
}

export interface ScanResultRecord {
  promptId: string;
  promptText: string;
  promptIntent: "discovery" | "comparison" | "alternative" | "review" | "local";
  engine: EngineId;
  model: string;
  answerText: string;
  latencyMs: number;
  costUsd: number;
  brandMentioned: boolean;
  brandPosition: number | null;
  brandSentiment: "positive" | "neutral" | "negative" | null;
  brandContext: string | null;
  entities: EntityMatch[];
  citations: { url: string; domain: string; sourceType: SourceType }[];
  suggestedCompetitors: string[];
  failed: boolean;
  error?: string;
  fromCache: boolean;
}

export interface ScanOutput {
  results: ScanResultRecord[];
  scores: ScoreOutput[];
  totalCostUsd: number;
  estimatedCostUsd: number;
  skippedEngines: EngineId[];
}

export async function runScan(
  options: ScanOptions,
  ledger: CostLedger,
): Promise<ScanOutput> {
  const providers = buildProviders({
    brandName: options.brand.name,
    competitorNames: options.competitors.map((c) => c.name),
  });

  const configuredEngines = options.engines.filter((e) => providers[e].isConfigured());
  const skippedEngines = options.engines.filter((e) => !providers[e].isConfigured());

  const estimatedCostUsd = configuredEngines.reduce(
    (sum, engine) => sum + estimateCallCostUsd(engine) * options.prompts.length,
    0,
  );
  if (options.budgetUsd !== undefined) {
    assertWithinBudget(estimatedCostUsd, options.budgetUsd);
  }

  const location = [options.brand.city, options.brand.country].filter(Boolean).join(", ");
  const webSearch = options.webSearch ?? true;

  const limiters = new Map<EngineId, ReturnType<typeof pLimit>>();
  for (const engine of configuredEngines) {
    limiters.set(engine, pLimit(PROVIDER_CONCURRENCY));
  }

  const competitorNames = options.competitors.map((c) => c.name);
  const competitorDomains = options.competitors.map((c) => c.website).filter(Boolean) as string[];

  const tasks = options.prompts.flatMap((prompt) =>
    configuredEngines.map((engine) =>
      limiters.get(engine)!(() =>
        runOne({
          prompt,
          engine,
          brand: options.brand,
          competitors: options.competitors,
          competitorNames,
          competitorDomains,
          location,
          webSearch,
          providers,
          ledger,
          workspaceId: options.workspaceId ?? null,
          cache: options.cache,
        }),
      ),
    ),
  );

  const results = await Promise.all(tasks);

  const scoreInputs: ScoreInputResult[] = results
    .filter((r) => !r.failed)
    .map((r) => ({
      engine: r.engine,
      brandMentioned: r.brandMentioned,
      brandPosition: r.brandPosition,
      brandSentiment: r.brandSentiment,
      entities: r.entities,
      citationDomains: r.citations.map((c) => c.domain),
    }));
  const scores = computeScoresByEngine(scoreInputs, options.brand.website);

  return {
    results,
    scores,
    totalCostUsd: ledger.totalUsd(),
    estimatedCostUsd,
    skippedEngines,
  };
}

async function runOne(ctx: {
  prompt: PromptRunnerInput;
  engine: EngineId;
  brand: BrandInput;
  competitors: CompetitorRunnerInput[];
  competitorNames: string[];
  competitorDomains: string[];
  location: string;
  webSearch: boolean;
  providers: ReturnType<typeof buildProviders>;
  ledger: CostLedger;
  workspaceId: string | null;
  cache?: ScanCacheAdapter;
}): Promise<ScanResultRecord> {
  const { prompt, engine, brand, competitors, providers, ledger } = ctx;

  try {
    const cached = await ctx.cache?.get({ promptId: prompt.id, engine });
    const fromCache = cached !== null && cached !== undefined;
    const response = cached ?? (await providers[engine].run({
      prompt: prompt.text,
      location: ctx.location || undefined,
      webSearch: ctx.webSearch,
    }));

    if (!fromCache) {
      ledger.logCall({
        workspaceId: ctx.workspaceId,
        purpose: "scan",
        engine,
        model: response.model,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        costUsd: response.usage.costUsd,
        latencyMs: response.latencyMs,
        ok: true,
      });
    }

    const passA = extractPassA({
      text: response.text,
      brandName: brand.name,
      brandAliases: brand.aliases,
      competitors,
      providerCitations: response.citations as ProviderCitation[],
    });

    let brandSentiment: "positive" | "neutral" | "negative" | null = null;
    let brandContext: string | null = null;
    let suggestedCompetitors: string[] = [];

    const shouldRunPassB =
      ENABLE_LLM_EXTRACTION && (passA.entities.length > 0 || passA.hasListFormat);
    if (shouldRunPassB) {
      const passB = await extractPassB({
        text: response.text,
        brandName: brand.name,
        competitorNames: ctx.competitorNames,
        callUtilityModel,
      });
      if (passB) {
        brandSentiment = passB.brand_sentiment;
        brandContext = passB.brand_context;
        suggestedCompetitors = findSuggestedCompetitors(
          passB.recommended_entities,
          brand.name,
          ctx.competitorNames,
        );
      }
    }

    const citations = passA.citations.map((c) => ({
      ...c,
      sourceType: classifySource(c.url, {
        brandDomain: brand.website,
        competitorDomains: ctx.competitorDomains,
      }),
    }));

    return {
      promptId: prompt.id,
      promptText: prompt.text,
      promptIntent: prompt.intent ?? "discovery",
      engine,
      model: response.model,
      answerText: response.text,
      latencyMs: response.latencyMs,
      costUsd: response.usage.costUsd,
      brandMentioned: passA.brandMentioned,
      brandPosition: passA.brandPosition,
      brandSentiment,
      brandContext,
      entities: passA.entities,
      citations,
      suggestedCompetitors,
      failed: false,
      fromCache,
    };
  } catch (err) {
    ledger.logCall({
      workspaceId: ctx.workspaceId,
      purpose: "scan",
      engine,
      model: "unknown",
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      latencyMs: 0,
      ok: false,
      error: String(err),
    });

    return {
      promptId: prompt.id,
      promptText: prompt.text,
      promptIntent: prompt.intent ?? "discovery",
      engine,
      model: "unknown",
      answerText: "",
      latencyMs: 0,
      costUsd: 0,
      brandMentioned: false,
      brandPosition: null,
      brandSentiment: null,
      brandContext: null,
      entities: [],
      citations: [],
      suggestedCompetitors: [],
      failed: true,
      error: String(err),
      fromCache: false,
    };
  }
}
