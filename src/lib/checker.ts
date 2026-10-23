import { createHash, randomUUID } from "node:crypto";
import { and, eq, gte } from "drizzle-orm";
import { db, schema } from "../db/client";
import { CHECKER_RESULT_CACHE_DAYS } from "../engine/config";
import { createInMemoryCostLedger } from "../engine/cost";
import { callUtilityModel } from "../engine/llm-utility";
import { generateRecommendations, type RecommendationDraft } from "../engine/recommend";
import { ALL_ENGINES } from "../engine/providers";
import type { EngineId } from "../engine/providers/types";
import { runScan, type ScanResultRecord } from "../engine/runner";
import { addCheckerSpendUsd } from "./rate-limit";

export interface CheckerInput {
  businessName: string;
  category: string;
  city?: string;
  country?: string;
  website?: string;
}

export interface CheckerMini {
  checkerResultId: string;
  overallScore: number;
  mentionedCount: number;
  totalAnswers: number;
  topCompetitors: string[];
  sampleAnswerBlurred: string;
}

export interface CheckerFull extends CheckerMini {
  input: CheckerInput;
  results: ScanResultRecord[];
  topFixes: RecommendationDraft[];
}

const CHECKER_PROMPT_COUNT = 3;
const CHECKER_ENGINES_FALLBACK: EngineId[] = ["gemini", "chatgpt"];

export function computeCacheKey(input: CheckerInput): string {
  const normalized = [input.businessName, input.category, input.city ?? "", input.country ?? ""]
    .map((s) => s.trim().toLowerCase())
    .join("|");
  return createHash("sha256").update(normalized).digest("hex");
}

/** Template fallback used when OpenRouter isn't configured (mock mode / zero keys). */
function templatePrompts(input: CheckerInput): string[] {
  const place = input.city ? ` in ${input.city}` : "";
  return [
    `best ${input.category}${place}`,
    `top ${input.category} companies${place}`,
    `${input.businessName} alternatives`,
  ];
}

async function generateCheckerPrompts(input: CheckerInput): Promise<string[]> {
  try {
    const raw = await callUtilityModel(
      `Generate exactly ${CHECKER_PROMPT_COUNT} short, natural buyer-style search prompts someone would type ` +
        `into an AI assistant while looking for a "${input.category}"${input.city ? ` in ${input.city}` : ""}. ` +
        `One of the ${CHECKER_PROMPT_COUNT} should ask about alternatives to "${input.businessName}" specifically. ` +
        `Respond with ONLY a JSON object: {"prompts": [string, string, string]}, no commentary.`,
    );
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    const json = JSON.parse(raw.slice(start, end + 1)) as { prompts?: string[] };
    if (Array.isArray(json.prompts) && json.prompts.length === CHECKER_PROMPT_COUNT) {
      return json.prompts;
    }
  } catch {
    // fall through to template prompts
  }
  return templatePrompts(input);
}

function pickCheckerEngines(): EngineId[] {
  if (ALL_ENGINES.includes("gemini")) {
    const other = ALL_ENGINES.find((e) => e !== "gemini") ?? "chatgpt";
    return ["gemini", other];
  }
  return CHECKER_ENGINES_FALLBACK;
}

function toMini(checkerResultId: string, full: Omit<CheckerFull, "checkerResultId">): CheckerMini {
  const sample = full.results.find((r) => !r.failed);
  return {
    checkerResultId,
    overallScore: full.overallScore,
    mentionedCount: full.mentionedCount,
    totalAnswers: full.totalAnswers,
    topCompetitors: full.topCompetitors,
    sampleAnswerBlurred: blur(sample?.answerText ?? ""),
  };
}

function blur(text: string): string {
  if (text.length <= 80) return text;
  return `${text.slice(0, 80)}… (unlock the full report to see the rest)`;
}

/**
 * Runs (or reuses a cached) free checker report. Returns the mini subset for
 * the public endpoint and the full payload persisted to checker_results for
 * the unlock endpoint to read back later.
 */
export async function runChecker(input: CheckerInput): Promise<CheckerMini> {
  const cacheKey = computeCacheKey(input);
  const cutoff = new Date(Date.now() - CHECKER_RESULT_CACHE_DAYS * 24 * 60 * 60 * 1000);

  const [cached] = await db
    .select()
    .from(schema.checkerResults)
    .where(and(eq(schema.checkerResults.cacheKey, cacheKey), gte(schema.checkerResults.createdAt, cutoff)));

  if (cached) {
    const payload = cached.payload as Omit<CheckerFull, "checkerResultId">;
    return toMini(cached.id, payload);
  }

  const engines = pickCheckerEngines();
  const promptTexts = await generateCheckerPrompts(input);
  const prompts = promptTexts.map((text, i) => ({ id: `check-${i + 1}`, text, intent: "discovery" as const }));

  const ledger = createInMemoryCostLedger();
  const output = await runScan(
    {
      brand: {
        name: input.businessName,
        website: input.website,
        city: input.city,
        country: input.country,
      },
      competitors: [],
      prompts,
      engines,
    },
    ledger,
  );

  addCheckerSpendUsd(output.totalCostUsd);

  const allScore = output.scores.find((s) => s.engine === "all");
  const mentionedCount = output.results.filter((r) => !r.failed && r.brandMentioned).length;
  const totalAnswers = output.results.filter((r) => !r.failed).length;

  const topCompetitors = Array.from(
    new Set(output.results.flatMap((r) => r.suggestedCompetitors)),
  ).slice(0, 3);

  const topFixes = generateRecommendations({
    brandName: input.businessName,
    brandWebsite: input.website,
    results: output.results,
  }).slice(0, 3);

  const full: Omit<CheckerFull, "checkerResultId"> = {
    input,
    overallScore: allScore?.overallScore ?? 0,
    mentionedCount,
    totalAnswers,
    topCompetitors,
    sampleAnswerBlurred: "", // filled per-call in toMini; not meaningful to persist blurred
    results: output.results,
    topFixes,
  };

  const checkerResultId = randomUUID();
  await db.insert(schema.checkerResults).values({
    id: checkerResultId,
    cacheKey,
    payload: full,
  });

  return toMini(checkerResultId, full);
}

export async function getFullCheckerResult(checkerResultId: string): Promise<CheckerFull | null> {
  const [row] = await db
    .select()
    .from(schema.checkerResults)
    .where(eq(schema.checkerResults.id, checkerResultId));
  if (!row) return null;
  const payload = row.payload as Omit<CheckerFull, "checkerResultId">;
  return { checkerResultId, ...payload };
}
