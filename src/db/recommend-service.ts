import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { generateRecommendationContent, type ContentContext } from "../engine/generate-content";
import { generateRecommendations, type RecommendationDraft } from "../engine/recommend";
import type { ScanResultRecord } from "../engine/runner";
import { db, schema } from "./client";

async function loadResultsForScan(scanId: string): Promise<ScanResultRecord[]> {
  const rows = await db.select().from(schema.scanResults).where(eq(schema.scanResults.scanId, scanId));
  if (rows.length === 0) return [];

  const promptIds = Array.from(new Set(rows.map((r) => r.promptId)));
  const resultIds = rows.map((r) => r.id);

  const [promptRows, citationRows] = await Promise.all([
    db.select().from(schema.prompts).where(inArray(schema.prompts.id, promptIds)),
    db.select().from(schema.citations).where(inArray(schema.citations.scanResultId, resultIds)),
  ]);

  const promptById = new Map(promptRows.map((p) => [p.id, p]));
  const citationsByResult = new Map<string, typeof citationRows>();
  for (const c of citationRows) {
    const list = citationsByResult.get(c.scanResultId) ?? [];
    list.push(c);
    citationsByResult.set(c.scanResultId, list);
  }

  return rows.map((r) => {
    const prompt = promptById.get(r.promptId);
    const citations = citationsByResult.get(r.id) ?? [];
    return {
      promptId: r.promptId,
      promptText: prompt?.text ?? "",
      promptIntent: prompt?.intent ?? "discovery",
      engine: r.engine as ScanResultRecord["engine"],
      model: r.model,
      answerText: r.answerText,
      latencyMs: r.latencyMs,
      costUsd: r.costUsd,
      brandMentioned: r.brandMentioned,
      brandPosition: r.brandPosition,
      brandSentiment: r.brandSentiment,
      brandContext: r.brandContext,
      entities: r.entities,
      citations: citations.map((c) => ({ url: c.url, domain: c.domain, sourceType: c.sourceType as never })),
      suggestedCompetitors: r.suggestedCompetitors,
      failed: r.failed,
      error: r.error ?? undefined,
      fromCache: false,
    };
  });
}

function buildContext(
  brand: typeof schema.brands.$inferSelect,
  draft: RecommendationDraft,
  results: ScanResultRecord[],
): ContentContext {
  const base: ContentContext = {
    brandName: brand.name,
    category: brand.category ?? undefined,
    website: brand.website ?? undefined,
    city: brand.city ?? undefined,
  };

  if (draft.type === "faq_page") {
    base.faqPrompts = results
      .filter((r) => !r.failed && !r.brandMentioned && (r.promptIntent === "discovery" || r.promptIntent === "local"))
      .map((r) => r.promptText)
      .slice(0, 5);
  }

  if (draft.type === "comparison_page") {
    const counts = new Map<string, number>();
    for (const r of results) {
      if (r.promptIntent !== "comparison" && r.promptIntent !== "alternative") continue;
      for (const e of r.entities) {
        if (!e.isBrand) counts.set(e.name, (counts.get(e.name) ?? 0) + 1);
      }
    }
    const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
    base.comparisonCompetitor = top?.[0];
  }

  if (draft.type === "get_listed") {
    const match = draft.title.match(/Get listed on (.+)$/);
    base.topCitedDomain = match?.[1];
  }

  if (draft.type === "community") {
    base.communityTopics = results
      .filter((r) => r.citations.some((c) => c.sourceType === "reddit" || c.sourceType === "youtube"))
      .map((r) => r.promptText)
      .slice(0, 5);
  }

  if (draft.type === "reputation") {
    base.negativeSnippets = results
      .filter((r) => r.brandSentiment === "negative" && r.brandContext)
      .map((r) => r.brandContext as string)
      .slice(0, 3);
  }

  return base;
}

/**
 * Generates (and persists) fix-list recommendations for a completed scan,
 * per spec §5.5. Skips a type that already has an open recommendation for
 * this brand, so re-scanning doesn't spam duplicate fixes.
 */
export async function processGenerateRecsJob(scanId: string): Promise<void> {
  const [scan] = await db.select().from(schema.scans).where(eq(schema.scans.id, scanId));
  if (!scan) throw new Error(`Scan ${scanId} not found`);

  const [brand] = await db.select().from(schema.brands).where(eq(schema.brands.id, scan.brandId));
  if (!brand) throw new Error(`Brand ${scan.brandId} not found`);

  const results = await loadResultsForScan(scanId);
  if (results.length === 0) return;

  const existingOpen = await db
    .select()
    .from(schema.recommendations)
    .where(and(eq(schema.recommendations.brandId, brand.id), eq(schema.recommendations.status, "open")));
  const openTypes = new Set(existingOpen.map((r) => r.type));

  const drafts = generateRecommendations({ brandName: brand.name, brandWebsite: brand.website ?? undefined, results });

  for (const draft of drafts) {
    if (openTypes.has(draft.type)) continue;

    const context = buildContext(brand, draft, results);
    const generated = await generateRecommendationContent(draft, context);

    await db.insert(schema.recommendations).values({
      id: randomUUID(),
      brandId: brand.id,
      scanId,
      type: draft.type,
      title: draft.title,
      why: draft.why,
      priority: draft.priority,
      status: "open",
      generatedContent: generated.content,
      contentFormat: generated.format,
    });
  }
}
