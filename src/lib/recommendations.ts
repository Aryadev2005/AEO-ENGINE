import { desc, eq } from "drizzle-orm";
import { generateRecommendationContent } from "../engine/generate-content";
import { db, schema } from "../db/client";
import { getBrand } from "./brands";

export async function listRecommendations(brandId: string) {
  return db
    .select()
    .from(schema.recommendations)
    .where(eq(schema.recommendations.brandId, brandId))
    .orderBy(desc(schema.recommendations.createdAt));
}

export async function updateRecommendationStatus(
  recommendationId: string,
  workspaceId: string,
  status: "open" | "done" | "dismissed",
): Promise<boolean> {
  const [rec] = await db
    .select()
    .from(schema.recommendations)
    .where(eq(schema.recommendations.id, recommendationId));
  if (!rec) return false;
  const brand = await getBrand(rec.brandId, workspaceId);
  if (!brand) return false;

  await db
    .update(schema.recommendations)
    .set({ status, updatedAt: new Date() })
    .where(eq(schema.recommendations.id, recommendationId));
  return true;
}

export async function regenerateRecommendation(
  recommendationId: string,
  workspaceId: string,
): Promise<boolean> {
  const [rec] = await db
    .select()
    .from(schema.recommendations)
    .where(eq(schema.recommendations.id, recommendationId));
  if (!rec) return false;
  const brand = await getBrand(rec.brandId, workspaceId);
  if (!brand) return false;

  const generated = await generateRecommendationContent(
    { type: rec.type, title: rec.title, why: rec.why, priority: rec.priority },
    {
      brandName: brand.name,
      category: brand.category ?? undefined,
      website: brand.website ?? undefined,
      city: brand.city ?? undefined,
    },
  );

  await db
    .update(schema.recommendations)
    .set({ generatedContent: generated.content, contentFormat: generated.format, updatedAt: new Date() })
    .where(eq(schema.recommendations.id, recommendationId));
  return true;
}
