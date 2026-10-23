import type { ScanResultRecord } from "./runner";

export type RecommendationType =
  | "get_listed"
  | "faq_page"
  | "comparison_page"
  | "schema"
  | "llms_txt"
  | "community"
  | "reviews"
  | "reputation";

export type RecommendationPriority = "high" | "med" | "low";

export interface RecommendationDraft {
  type: RecommendationType;
  title: string;
  why: string;
  priority: RecommendationPriority;
}

export interface ReviewComparison {
  rating: number | null;
  reviewCount: number | null;
  competitorMaxReviewCount?: number | null;
}

export interface RecommendInput {
  brandName: string;
  brandWebsite?: string;
  results: ScanResultRecord[];
  /** From a live homepage fetch; undefined means "not checked", which skips the rule entirely. */
  hasSchema?: boolean;
  hasLlmsTxt?: boolean;
  reviews?: ReviewComparison;
}

const PRIORITY_RANK: Record<RecommendationPriority, number> = { high: 0, med: 1, low: 2 };

/** Implements the 8 rule-based checks from spec §5.5 against a completed scan's results. */
export function generateRecommendations(input: RecommendInput): RecommendationDraft[] {
  const drafts: RecommendationDraft[] = [];
  const successful = input.results.filter((r) => !r.failed);
  if (successful.length === 0) return drafts;

  drafts.push(...getListedRule(input, successful));
  drafts.push(...faqPageRule(successful));
  drafts.push(...comparisonPageRule(successful));
  drafts.push(...schemaRule(input));
  drafts.push(...llmsTxtRule(input));
  drafts.push(...communityRule(successful));
  drafts.push(...reviewsRule(input));
  drafts.push(...reputationRule(successful));

  return drafts.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
}

function getListedRule(input: RecommendInput, results: ScanResultRecord[]): RecommendationDraft[] {
  const counts = new Map<string, number>();
  for (const r of results) {
    for (const c of r.citations) {
      if (c.sourceType !== "review_site" && c.sourceType !== "directory") continue;
      const isOwn =
        input.brandWebsite &&
        c.domain === new URL(ensureProtocol(input.brandWebsite)).hostname.replace(/^www\./, "");
      if (isOwn) continue;
      counts.set(c.domain, (counts.get(c.domain) ?? 0) + 1);
    }
  }
  if (counts.size === 0) return [];

  const [topDomain, topCount] = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
  const ratio = topCount / results.length;
  return [
    {
      type: "get_listed",
      title: `Get listed on ${topDomain}`,
      why: `${topDomain} was cited in ${topCount}/${results.length} answers and you're not listed there.`,
      priority: ratio >= 0.3 ? "high" : "med",
    },
  ];
}

function faqPageRule(results: ScanResultRecord[]): RecommendationDraft[] {
  const subset = results.filter((r) => r.promptIntent === "discovery" || r.promptIntent === "local");
  if (subset.length === 0) return [];
  const mentioned = subset.filter((r) => r.brandMentioned).length;
  const visibilityPct = (mentioned / subset.length) * 100;
  if (visibilityPct >= 30) return [];
  return [
    {
      type: "faq_page",
      title: "Publish an FAQ page answering your category's top questions",
      why: `Only mentioned in ${mentioned}/${subset.length} (${Math.round(visibilityPct)}%) of "best X in Y"-style answers.`,
      priority: visibilityPct < 10 ? "high" : "med",
    },
  ];
}

function comparisonPageRule(results: ScanResultRecord[]): RecommendationDraft[] {
  const subset = results.filter((r) => r.promptIntent === "comparison" || r.promptIntent === "alternative");
  if (subset.length === 0) return [];
  const mentioned = subset.filter((r) => r.brandMentioned).length;
  const visibilityPct = (mentioned / subset.length) * 100;
  if (visibilityPct >= 50) return [];
  return [
    {
      type: "comparison_page",
      title: "Publish a comparison / alternatives page",
      why: `Missing from ${subset.length - mentioned}/${subset.length} comparison or alternative-style answers.`,
      priority: mentioned === 0 ? "high" : "med",
    },
  ];
}

function schemaRule(input: RecommendInput): RecommendationDraft[] {
  if (input.hasSchema !== false) return [];
  return [
    {
      type: "schema",
      title: "Add Organization/LocalBusiness schema to your homepage",
      why: "No JSON-LD structured data found on your homepage — LLMs and search engines both use this to understand what you are.",
      priority: "med",
    },
  ];
}

function llmsTxtRule(input: RecommendInput): RecommendationDraft[] {
  if (input.hasLlmsTxt !== false) return [];
  return [
    {
      type: "llms_txt",
      title: "Add an /llms.txt file",
      why: "No /llms.txt found — this gives AI crawlers a clean, curated summary of what you offer.",
      priority: "low",
    },
  ];
}

function communityRule(results: ScanResultRecord[]): RecommendationDraft[] {
  const communityResults = results.filter((r) =>
    r.citations.some((c) => c.sourceType === "reddit" || c.sourceType === "youtube"),
  );
  if (communityResults.length < 2) return [];
  const mentioned = communityResults.filter((r) => r.brandMentioned).length;
  const visibilityPct = (mentioned / communityResults.length) * 100;
  if (visibilityPct >= 50) return [];
  return [
    {
      type: "community",
      title: "Show up where Reddit/YouTube already drive recommendations",
      why: `Reddit or YouTube was cited in ${communityResults.length} answers for your category, but you're mentioned in only ${mentioned} of them.`,
      priority: "med",
    },
  ];
}

function reviewsRule(input: RecommendInput): RecommendationDraft[] {
  const r = input.reviews;
  if (!r) return [];
  const ratingLow = r.rating !== null && r.rating !== undefined && r.rating < 4.3;
  const behindCompetitors =
    r.reviewCount !== null &&
    r.reviewCount !== undefined &&
    r.competitorMaxReviewCount !== null &&
    r.competitorMaxReviewCount !== undefined &&
    r.reviewCount < r.competitorMaxReviewCount;
  if (!ratingLow && !behindCompetitors) return [];
  const why = ratingLow
    ? `Google rating is ${r.rating}, below the 4.3 threshold that tends to get cited positively.`
    : `Review count (${r.reviewCount}) trails the leading competitor (${r.competitorMaxReviewCount}).`;
  return [
    {
      type: "reviews",
      title: "Run a review-request campaign",
      why,
      priority: ratingLow ? "high" : "med",
    },
  ];
}

function reputationRule(results: ScanResultRecord[]): RecommendationDraft[] {
  const negative = results.filter((r) => r.brandSentiment === "negative");
  if (negative.length === 0) return [];
  return [
    {
      type: "reputation",
      title: "Address the negative context AI assistants are picking up",
      why: `${negative.length} answer(s) mentioned you with negative sentiment.`,
      priority: negative.length >= 2 ? "high" : "med",
    },
  ];
}

function ensureProtocol(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}
