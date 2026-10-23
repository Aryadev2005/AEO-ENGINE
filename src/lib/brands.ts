import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { callUtilityModel } from "../engine/llm-utility";
import type { PromptIntent } from "../engine/prompts";
import { db, schema } from "../db/client";

export async function listBrands(workspaceId: string) {
  return db.select().from(schema.brands).where(eq(schema.brands.workspaceId, workspaceId));
}

export async function getBrand(brandId: string, workspaceId: string) {
  const [brand] = await db
    .select()
    .from(schema.brands)
    .where(and(eq(schema.brands.id, brandId), eq(schema.brands.workspaceId, workspaceId)));
  return brand ?? null;
}

export interface CreateBrandInput {
  name: string;
  aliases?: string[];
  website?: string;
  category?: string;
  city?: string;
  country?: string;
  description?: string;
}

export async function createBrand(workspaceId: string, input: CreateBrandInput) {
  const id = randomUUID();
  await db.insert(schema.brands).values({
    id,
    workspaceId,
    name: input.name,
    aliases: input.aliases ?? [],
    website: input.website ?? null,
    category: input.category ?? null,
    city: input.city ?? null,
    country: input.country ?? null,
    description: input.description ?? null,
  });
  return getBrand(id, workspaceId);
}

export async function updateBrand(
  brandId: string,
  workspaceId: string,
  patch: Partial<CreateBrandInput> & { schedule?: "off" | "weekly" | "daily" },
) {
  const existing = await getBrand(brandId, workspaceId);
  if (!existing) return null;
  await db
    .update(schema.brands)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.brands.id, brandId));
  return getBrand(brandId, workspaceId);
}

/** Foreign keys are enforced (PRAGMA foreign_keys = ON), so dependents must go first, leaves to root. */
export async function deleteBrand(brandId: string, workspaceId: string): Promise<boolean> {
  const existing = await getBrand(brandId, workspaceId);
  if (!existing) return false;

  const scanIdsSubquery = db.select({ id: schema.scans.id }).from(schema.scans).where(eq(schema.scans.brandId, brandId));
  const resultIdsSubquery = db
    .select({ id: schema.scanResults.id })
    .from(schema.scanResults)
    .where(inArray(schema.scanResults.scanId, scanIdsSubquery));

  await db.delete(schema.citations).where(inArray(schema.citations.scanResultId, resultIdsSubquery));
  await db.delete(schema.scanResults).where(inArray(schema.scanResults.scanId, scanIdsSubquery));
  await db.delete(schema.scores).where(eq(schema.scores.brandId, brandId));
  await db.delete(schema.recommendations).where(eq(schema.recommendations.brandId, brandId));
  await db.delete(schema.reviewSnapshots).where(eq(schema.reviewSnapshots.brandId, brandId));
  await db.delete(schema.scans).where(eq(schema.scans.brandId, brandId));
  await db.delete(schema.prompts).where(eq(schema.prompts.brandId, brandId));
  await db.delete(schema.competitors).where(eq(schema.competitors.brandId, brandId));
  await db.delete(schema.brands).where(eq(schema.brands.id, brandId));
  return true;
}

export async function listCompetitors(brandId: string) {
  return db.select().from(schema.competitors).where(eq(schema.competitors.brandId, brandId));
}

export async function addCompetitor(
  brandId: string,
  input: { name: string; aliases?: string[]; website?: string },
) {
  const id = randomUUID();
  await db.insert(schema.competitors).values({
    id,
    brandId,
    name: input.name,
    aliases: input.aliases ?? [],
    website: input.website ?? null,
  });
  return id;
}

/** Verifies the competitor's brand belongs to this workspace before deleting (prevents cross-tenant deletes). */
export async function removeCompetitor(competitorId: string, workspaceId: string): Promise<boolean> {
  const [competitor] = await db
    .select()
    .from(schema.competitors)
    .where(eq(schema.competitors.id, competitorId));
  if (!competitor) return false;
  const brand = await getBrand(competitor.brandId, workspaceId);
  if (!brand) return false;
  await db.delete(schema.competitors).where(eq(schema.competitors.id, competitorId));
  return true;
}

export async function listPrompts(brandId: string) {
  return db.select().from(schema.prompts).where(eq(schema.prompts.brandId, brandId));
}

export async function addPrompt(
  brandId: string,
  input: { text: string; intent?: PromptIntent; source?: "manual" | "generated" },
) {
  const id = randomUUID();
  await db.insert(schema.prompts).values({
    id,
    brandId,
    text: input.text,
    intent: input.intent ?? "discovery",
    source: input.source ?? "manual",
  });
  return id;
}

export async function updatePrompt(
  promptId: string,
  workspaceId: string,
  patch: { text?: string; intent?: PromptIntent; isActive?: boolean },
): Promise<boolean> {
  const [prompt] = await db.select().from(schema.prompts).where(eq(schema.prompts.id, promptId));
  if (!prompt) return false;
  const brand = await getBrand(prompt.brandId, workspaceId);
  if (!brand) return false;
  await db
    .update(schema.prompts)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.prompts.id, promptId));
  return true;
}

export async function removePrompt(promptId: string, workspaceId: string): Promise<boolean> {
  const [prompt] = await db.select().from(schema.prompts).where(eq(schema.prompts.id, promptId));
  if (!prompt) return false;
  const brand = await getBrand(prompt.brandId, workspaceId);
  if (!brand) return false;
  await db.delete(schema.prompts).where(eq(schema.prompts.id, promptId));
  return true;
}

export interface BrandSummary {
  brand: typeof schema.brands.$inferSelect;
  latestOverallScore: number | null;
  previousOverallScore: number | null;
  lastScanAt: Date | null;
}

/** Home page list: each brand plus its latest "all engines" score and the one before it (for a delta). */
export async function listBrandsWithSummary(workspaceId: string): Promise<BrandSummary[]> {
  const brandRows = await listBrands(workspaceId);
  if (brandRows.length === 0) return [];

  // One query for every brand's "all engines" score history, newest first, instead
  // of one round-trip per brand — this page loads on every visit to the workspace home.
  const allScores = await db
    .select()
    .from(schema.scores)
    .where(
      and(
        inArray(
          schema.scores.brandId,
          brandRows.map((b) => b.id),
        ),
        eq(schema.scores.engine, "all"),
      ),
    )
    .orderBy(desc(schema.scores.computedAt));

  const scoresByBrand = new Map<string, typeof allScores>();
  for (const s of allScores) {
    const list = scoresByBrand.get(s.brandId) ?? [];
    list.push(s);
    scoresByBrand.set(s.brandId, list);
  }

  return brandRows.map((brand) => {
    const scores = scoresByBrand.get(brand.id) ?? [];
    return {
      brand,
      latestOverallScore: scores[0]?.overallScore ?? null,
      previousOverallScore: scores[1]?.overallScore ?? null,
      lastScanAt: scores[0]?.computedAt ?? null,
    };
  });
}

export async function getLatestScores(brandId: string) {
  const [latestScan] = await db
    .select()
    .from(schema.scans)
    .where(and(eq(schema.scans.brandId, brandId), eq(schema.scans.status, "done")))
    .orderBy(desc(schema.scans.finishedAt));
  if (!latestScan) return { scan: null, scores: [] };
  const scores = await db.select().from(schema.scores).where(eq(schema.scores.scanId, latestScan.id));
  return { scan: latestScan, scores };
}

export async function getScoreHistory(brandId: string) {
  const rows = await db
    .select()
    .from(schema.scores)
    .where(and(eq(schema.scores.brandId, brandId), eq(schema.scores.engine, "all")))
    .orderBy(asc(schema.scores.computedAt));
  return rows;
}

export async function listScans(brandId: string) {
  return db
    .select()
    .from(schema.scans)
    .where(eq(schema.scans.brandId, brandId))
    .orderBy(desc(schema.scans.createdAt));
}

export async function getLatestDoneScanResults(brandId: string) {
  const [latestScan] = await db
    .select()
    .from(schema.scans)
    .where(and(eq(schema.scans.brandId, brandId), eq(schema.scans.status, "done")))
    .orderBy(desc(schema.scans.finishedAt))
    .limit(1);
  if (!latestScan) return null;
  return getScanResults(brandId, latestScan.id);
}

export async function getScanResults(brandId: string, scanId: string) {
  const [scan] = await db
    .select()
    .from(schema.scans)
    .where(and(eq(schema.scans.id, scanId), eq(schema.scans.brandId, brandId)));
  if (!scan) return null;

  const results = await db.select().from(schema.scanResults).where(eq(schema.scanResults.scanId, scanId));

  const citationsByResult = new Map<string, (typeof schema.citations.$inferSelect)[]>();
  if (results.length > 0) {
    const allCitations = await db
      .select()
      .from(schema.citations)
      .where(
        inArray(
          schema.citations.scanResultId,
          results.map((r) => r.id),
        ),
      );
    for (const c of allCitations) {
      const list = citationsByResult.get(c.scanResultId) ?? [];
      list.push(c);
      citationsByResult.set(c.scanResultId, list);
    }
  }

  return {
    scan,
    results: results.map((r) => ({ ...r, citations: citationsByResult.get(r.id) ?? [] })),
  };
}

/** Template fallback used when OpenRouter isn't configured. */
function templateCompetitors(): string[] {
  return [];
}

export async function suggestCompetitors(input: {
  brandName: string;
  category?: string;
  city?: string;
  known: string[];
}): Promise<string[]> {
  try {
    const raw = await callUtilityModel(
      `List up to 5 real, well-known competitors of "${input.brandName}"` +
        `${input.category ? ` (category: ${input.category})` : ""}` +
        `${input.city ? ` in or near ${input.city}` : ""}. ` +
        `Do not include "${input.brandName}" itself or any of: ${input.known.join(", ") || "(none)"}. ` +
        `Respond with ONLY JSON: {"competitors": [string, ...]}, no commentary.`,
    );
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    const json = JSON.parse(raw.slice(start, end + 1)) as { competitors?: string[] };
    if (Array.isArray(json.competitors)) {
      const known = new Set(input.known.map((k) => k.toLowerCase()));
      return json.competitors
        .filter((c) => typeof c === "string" && c.trim() && !known.has(c.trim().toLowerCase()))
        .slice(0, 5);
    }
  } catch {
    // fall through
  }
  return templateCompetitors();
}

export interface GeneratedPrompt {
  text: string;
  intent: PromptIntent;
}

function templatePrompts(input: {
  brandName: string;
  category: string;
  city?: string;
  country?: string;
  competitorNames: string[];
}): GeneratedPrompt[] {
  const place = input.city ? ` in ${input.city}` : input.country ? ` in ${input.country}` : "";
  const prompts: GeneratedPrompt[] = [
    { text: `best ${input.category}${place}`, intent: "discovery" },
    { text: `top ${input.category} companies${place}`, intent: "discovery" },
    { text: `who are the leading ${input.category} providers${place}`, intent: "discovery" },
    { text: `affordable ${input.category}${place}`, intent: "discovery" },
    { text: `${input.category} near me`, intent: "local" },
    { text: `best ${input.category} recommended locally${place}`, intent: "local" },
    { text: `${input.brandName} alternatives`, intent: "alternative" },
    { text: `alternatives to ${input.brandName} for ${input.category}`, intent: "alternative" },
    { text: `reviews of ${input.brandName}`, intent: "review" },
    { text: `is ${input.brandName} good for ${input.category}`, intent: "review" },
  ];
  for (const competitor of input.competitorNames.slice(0, 3)) {
    prompts.push({ text: `${input.brandName} vs ${competitor}`, intent: "comparison" });
  }
  return prompts;
}

export async function generatePrompts(input: {
  brandName: string;
  category: string;
  city?: string;
  country?: string;
  competitorNames: string[];
}): Promise<GeneratedPrompt[]> {
  try {
    const raw = await callUtilityModel(
      `Generate 15 short, natural buyer-style search prompts someone would type into an AI assistant ` +
        `while researching "${input.category}"${input.city ? ` in ${input.city}` : ""}${input.country ? `, ${input.country}` : ""}. ` +
        `Mix intents: discovery ("best X in Y"), local ("X near me"), comparison ("${input.brandName} vs <competitor>"), ` +
        `alternative ("${input.brandName} alternatives"), and review ("reviews of ${input.brandName}"). ` +
        `Known competitors to reference in comparison prompts: ${input.competitorNames.join(", ") || "(none known yet)"}. ` +
        `Respond with ONLY JSON: {"prompts": [{"text": string, "intent": "discovery"|"local"|"comparison"|"alternative"|"review"}]}, no commentary.`,
    );
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    const json = JSON.parse(raw.slice(start, end + 1)) as { prompts?: GeneratedPrompt[] };
    if (Array.isArray(json.prompts) && json.prompts.length > 0) {
      return json.prompts.filter((p) => p.text && p.intent);
    }
  } catch {
    // fall through
  }
  return templatePrompts(input);
}
