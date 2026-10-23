import { isSameDomain } from "./classify-source";
import { positionScore, SCORE_WEIGHTS } from "./config";
import type { EntityMatch } from "./extract";
import type { EngineId } from "./providers/types";

export interface ScoreInputResult {
  engine: EngineId;
  brandMentioned: boolean;
  brandPosition: number | null;
  brandSentiment: "positive" | "neutral" | "negative" | null;
  entities: EntityMatch[];
  citationDomains: string[];
}

export interface ScoreOutput {
  engine: EngineId | "all";
  visibilityPct: number;
  avgPosition: number | null;
  shareOfVoicePct: number;
  citationSharePct: number;
  sentimentScore: number | null;
  overallScore: number;
}

/** Implements the scoring formulas from spec 5.3 for one group of results. */
export function computeScore(
  engine: EngineId | "all",
  results: ScoreInputResult[],
  brandDomain?: string,
): ScoreOutput {
  const total = results.length;
  const mentioned = results.filter((r) => r.brandMentioned);

  const visibilityPct = total > 0 ? (mentioned.length / total) * 100 : 0;

  const avgPosition =
    mentioned.length > 0
      ? mentioned.reduce((sum, r) => sum + (r.brandPosition ?? 0), 0) / mentioned.length
      : null;

  const brandMentionsCount = mentioned.length;
  const competitorMentionsCount = results.reduce(
    (sum, r) => sum + r.entities.filter((e) => !e.isBrand).length,
    0,
  );
  const shareOfVoicePct =
    brandMentionsCount + competitorMentionsCount > 0
      ? (brandMentionsCount / (brandMentionsCount + competitorMentionsCount)) * 100
      : 0;

  const allDomains = results.flatMap((r) => r.citationDomains);
  const brandDomainHits = brandDomain
    ? allDomains.filter((d) => isSameDomain(d, brandDomain)).length
    : 0;
  const citationSharePct = allDomains.length > 0 ? (brandDomainHits / allDomains.length) * 100 : 0;

  const positiveCount = mentioned.filter((r) => r.brandSentiment === "positive").length;
  const negativeCount = mentioned.filter((r) => r.brandSentiment === "negative").length;
  const sentimentScore =
    mentioned.length > 0 ? (positiveCount - negativeCount) / mentioned.length : null;

  const avgPositionScore =
    mentioned.length > 0
      ? mentioned.reduce((sum, r) => sum + positionScore(r.brandPosition), 0) / mentioned.length
      : 0;

  const overallScore =
    SCORE_WEIGHTS.visibility * visibilityPct +
    SCORE_WEIGHTS.position * avgPositionScore +
    SCORE_WEIGHTS.shareOfVoice * shareOfVoicePct +
    SCORE_WEIGHTS.citationShare * citationSharePct;

  return {
    engine,
    visibilityPct: round2(visibilityPct),
    avgPosition: avgPosition === null ? null : round2(avgPosition),
    shareOfVoicePct: round2(shareOfVoicePct),
    citationSharePct: round2(citationSharePct),
    sentimentScore: sentimentScore === null ? null : round2(sentimentScore),
    overallScore: round2(overallScore),
  };
}

/** Groups results by engine and also computes the "all engines" aggregate. */
export function computeScoresByEngine(
  results: ScoreInputResult[],
  brandDomain?: string,
): ScoreOutput[] {
  const byEngine = new Map<EngineId, ScoreInputResult[]>();
  for (const r of results) {
    const list = byEngine.get(r.engine) ?? [];
    list.push(r);
    byEngine.set(r.engine, list);
  }

  const perEngine = Array.from(byEngine.entries()).map(([engine, group]) =>
    computeScore(engine, group, brandDomain),
  );
  const overall = computeScore("all", results, brandDomain);
  return [...perEngine, overall];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
