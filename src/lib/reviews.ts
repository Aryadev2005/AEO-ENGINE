import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { callUtilityModel } from "../engine/llm-utility";
import { db, schema } from "../db/client";
import { getPlaceDetails, reviewLinkFor, type PlaceReview } from "./places";

export async function connectPlace(brandId: string, placeId: string): Promise<void> {
  await db.update(schema.brands).set({ googlePlaceId: placeId, updatedAt: new Date() }).where(eq(schema.brands.id, brandId));
}

export async function refreshReviewSnapshot(brandId: string, placeId: string) {
  const details = await getPlaceDetails(placeId);
  const id = randomUUID();
  await db.insert(schema.reviewSnapshots).values({
    id,
    brandId,
    rating: details.rating,
    reviewCount: details.userRatingCount,
    recentReviews: details.reviews,
  });
  return details;
}

export async function getLatestReviewSnapshot(brandId: string) {
  const [snapshot] = await db
    .select()
    .from(schema.reviewSnapshots)
    .where(eq(schema.reviewSnapshots.brandId, brandId))
    .orderBy(desc(schema.reviewSnapshots.fetchedAt))
    .limit(1);
  return snapshot ?? null;
}

/** Static templates — the brand asks real customers for a genuine review; never generates one. */
export function reviewRequestTemplates(brandName: string, placeId: string) {
  const link = reviewLinkFor(placeId);
  return {
    whatsapp: `Hi! Thanks for choosing ${brandName}. If you have a minute, a quick Google review would mean a lot: ${link}`,
    sms: `${brandName}: thanks for your business! Mind leaving us a quick review? ${link}`,
    email: {
      subject: `Got a minute for ${brandName}?`,
      body: `Hi,\n\nThanks again for choosing ${brandName}. If you were happy with us, a short Google review helps other customers find us:\n${link}\n\nThanks!`,
    },
  };
}

const FALLBACK_REPLY = (review: PlaceReview, brandName: string) =>
  review.rating !== null && review.rating <= 3
    ? `Thank you for the feedback — we're sorry to hear this didn't meet expectations. We'd like to make it right; please reach out to us directly so we can help.`
    : `Thank you so much for the kind words, ${review.authorName}! We really appreciate you taking the time, and we look forward to serving you again at ${brandName}.`;

export async function draftReviewReply(review: PlaceReview, brandName: string): Promise<string> {
  try {
    const raw = await callUtilityModel(
      `Write a short, polite, specific reply (2-3 sentences, no generic filler) from the business "${brandName}" ` +
        `to this Google review. Reply as the business owner would, addressing anything specific they mentioned. ` +
        `Never offer discounts, refunds, or anything that sounds like it's trying to buy a better review. ` +
        `Respond with ONLY JSON: {"reply": string}, no commentary.\n\n` +
        `Review (${review.rating ?? "no"} stars) by ${review.authorName}: "${review.text}"`,
    );
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    const json = JSON.parse(raw.slice(start, end + 1)) as { reply?: string };
    if (json.reply) return json.reply;
  } catch {
    // fall through
  }
  return FALLBACK_REPLY(review, brandName);
}
