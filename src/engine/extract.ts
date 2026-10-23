import { z } from "zod";
import { domainOf } from "./classify-source";

const BARE_DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

/**
 * Some providers' grounding citations route through their own redirect/proxy
 * (confirmed for Gemini: citation `url`s are all `vertexaisearch.cloud.google.com/...`,
 * which is useless for source classification) but put the real source's bare
 * domain in `title` instead. When `title` looks like a domain, trust it over
 * the URL's own host — harmless for other providers, whose citation titles
 * are human-readable article titles that won't match the bare-domain shape.
 */
function resolveDomain(url: string, title?: string): string {
  const trimmedTitle = title?.trim();
  if (trimmedTitle && BARE_DOMAIN_RE.test(trimmedTitle)) {
    return trimmedTitle.toLowerCase();
  }
  return domainOf(url);
}

export interface EntityMatch {
  name: string;
  position: number;
  isBrand: boolean;
  competitorId: string | null;
}

export interface ExtractCitation {
  url: string;
  domain: string;
}

export interface PassAResult {
  brandMentioned: boolean;
  brandPosition: number | null;
  entities: EntityMatch[];
  citations: ExtractCitation[];
  hasListFormat: boolean;
}

export interface CompetitorInput {
  id: string;
  name: string;
  aliases?: string[];
}

export interface PassAInput {
  text: string;
  brandName: string;
  brandAliases?: string[];
  competitors: CompetitorInput[];
  providerCitations: { url: string; title?: string }[];
}

/** Escapes regex metacharacters and lets whitespace match flexibly across newlines/spaces. */
function toRegexSource(variant: string): string {
  const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return escaped.replace(/\s+/g, "\\s+");
}

/** Generates tolerant spelling variants (&/and, trailing .com, Pvt Ltd/Inc/LLC suffixes). */
function nameVariants(name: string): string[] {
  const base = name.trim();
  const variants = new Set<string>();
  variants.add(base);
  variants.add(base.replace(/&/g, "and"));
  variants.add(base.replace(/\band\b/gi, "&"));
  variants.add(base.replace(/\.com$/i, ""));
  variants.add(
    base
      .replace(/,?\s*(pvt\.?\s*ltd\.?|private limited|inc\.?|llc\.?|ltd\.?)\s*$/i, "")
      .trim(),
  );
  return Array.from(variants).filter((v) => v.length > 1);
}

function findFirstIndex(lowerText: string, name: string, aliases: string[]): number {
  let best = Infinity;
  for (const alias of [name, ...aliases]) {
    for (const variant of nameVariants(alias)) {
      const pattern = new RegExp(`\\b${toRegexSource(variant.toLowerCase())}\\b`);
      const m = lowerText.match(pattern);
      if (m && m.index !== undefined && m.index < best) best = m.index;
    }
  }
  return best;
}

interface ListRange {
  start: number;
  end: number;
  rank: number;
}

/** Finds numbered/bulleted list lines so entity order can follow the list instead of raw char offset. */
function listItemRanges(text: string): ListRange[] {
  const lines = text.split("\n");
  const ranges: ListRange[] = [];
  let offset = 0;
  let rank = 0;
  for (const line of lines) {
    if (/^\s*(?:\d+[.)]|[-*•])\s+/.test(line)) {
      rank++;
      ranges.push({ start: offset, end: offset + line.length, rank });
    }
    offset += line.length + 1;
  }
  return ranges;
}

function listRankForIndex(ranges: ListRange[], idx: number): number | null {
  const r = ranges.find((range) => idx >= range.start && idx <= range.end);
  return r ? r.rank : null;
}

/**
 * Deterministic, free extraction pass: word-boundary name matching for the
 * brand and each tracked competitor, position ranked by list order (if the
 * answer has one) else first-appearance offset, plus citation URLs pulled
 * from both the provider's own citations and any URLs embedded in the text.
 */
export function extractPassA(input: PassAInput): PassAResult {
  const { text } = input;
  const lowerText = text.toLowerCase();
  const listRanges = listItemRanges(text);

  const candidates: {
    name: string;
    isBrand: boolean;
    competitorId: string | null;
    charIndex: number;
  }[] = [];

  const brandIdx = findFirstIndex(lowerText, input.brandName, input.brandAliases ?? []);
  if (brandIdx !== Infinity) {
    candidates.push({
      name: input.brandName,
      isBrand: true,
      competitorId: null,
      charIndex: brandIdx,
    });
  }
  for (const c of input.competitors) {
    const idx = findFirstIndex(lowerText, c.name, c.aliases ?? []);
    if (idx !== Infinity) {
      candidates.push({ name: c.name, isBrand: false, competitorId: c.id, charIndex: idx });
    }
  }

  const ranked = candidates
    .map((c) => ({ ...c, listRank: listRankForIndex(listRanges, c.charIndex) }))
    .sort((a, b) => {
      const ar = a.listRank ?? Number.MAX_SAFE_INTEGER;
      const br = b.listRank ?? Number.MAX_SAFE_INTEGER;
      if (ar !== br) return ar - br;
      return a.charIndex - b.charIndex;
    });

  const entities: EntityMatch[] = ranked.map((r, i) => ({
    name: r.name,
    position: i + 1,
    isBrand: r.isBrand,
    competitorId: r.competitorId,
  }));

  const brandEntity = entities.find((e) => e.isBrand) ?? null;

  const seen = new Set<string>();
  const citations: ExtractCitation[] = [];
  const addCitation = (url: string, title?: string) => {
    const key = url.replace(/\/$/, "").toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    citations.push({ url, domain: resolveDomain(url, title) });
  };
  for (const c of input.providerCitations) addCitation(c.url, c.title);
  for (const m of text.match(/https?:\/\/[^\s)\]]+/g) ?? []) addCitation(m);

  return {
    brandMentioned: brandEntity !== null,
    brandPosition: brandEntity?.position ?? null,
    entities,
    citations,
    hasListFormat: listRanges.length > 0,
  };
}

export const ExtractionLlmSchema = z.object({
  recommended_entities: z.array(z.object({ name: z.string(), position: z.number() })),
  brand_sentiment: z.enum(["positive", "neutral", "negative"]).nullable(),
  brand_context: z.string().nullable(),
});

export type ExtractionLlmOutput = z.infer<typeof ExtractionLlmSchema>;

export function buildExtractionPrompt(
  answerText: string,
  brandName: string,
  competitorNames: string[],
): string {
  return `Given the assistant answer below, extract structured data as JSON matching exactly this shape:
{"recommended_entities": [{"name": string, "position": number}], "brand_sentiment": "positive"|"neutral"|"negative"|null, "brand_context": string|null}

- recommended_entities: every business/product/service recommended in the answer, in the order they appear, 1-indexed position.
- brand_sentiment: the sentiment of the answer toward "${brandName}" specifically, or null if "${brandName}" is not mentioned.
- brand_context: the sentence(s) mentioning "${brandName}", or null if not mentioned.

Known competitors to recognize by name if present: ${competitorNames.join(", ") || "(none tracked yet)"}.
Respond with ONLY the JSON object, no markdown fences, no commentary.

Answer:
"""
${answerText}
"""`;
}

function extractJsonBlock(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return candidate.trim();
  return candidate.slice(start, end + 1);
}

/**
 * LLM-backed extraction pass, run only when Pass A finds something to
 * confirm (per spec 5.2). Retries once on a parse failure, then degrades to
 * null so a single bad JSON response never fails the whole scan.
 */
export async function extractPassB(opts: {
  text: string;
  brandName: string;
  competitorNames: string[];
  callUtilityModel: (prompt: string) => Promise<string>;
}): Promise<ExtractionLlmOutput | null> {
  const prompt = buildExtractionPrompt(opts.text, opts.brandName, opts.competitorNames);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await opts.callUtilityModel(prompt);
      const json = JSON.parse(extractJsonBlock(raw));
      return ExtractionLlmSchema.parse(json);
    } catch {
      // retry once; on second failure, caller proceeds with Pass A results only
    }
  }
  return null;
}

/** Entities the LLM pass found that aren't the brand or an already-tracked competitor. */
export function findSuggestedCompetitors(
  llmEntities: { name: string }[],
  brandName: string,
  knownNames: string[],
): string[] {
  const known = new Set(
    [brandName, ...knownNames].map((n) => n.trim().toLowerCase()),
  );
  const suggested = new Set<string>();
  for (const e of llmEntities) {
    const key = e.name.trim().toLowerCase();
    if (!key || known.has(key)) continue;
    suggested.add(e.name.trim());
  }
  return Array.from(suggested);
}
