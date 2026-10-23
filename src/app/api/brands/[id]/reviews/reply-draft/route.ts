import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getBrand } from "@/lib/brands";
import { draftReviewReply, getLatestReviewSnapshot } from "@/lib/reviews";
import { requireSessionOrResponse } from "@/lib/session";
import type { PlaceReview } from "@/lib/places";

export const dynamic = "force-dynamic";

const BodySchema = z.object({ reviewIndex: z.number().int().min(0) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireSessionOrResponse();
  if (response) return response;

  const { id } = await params;
  const brand = await getBrand(id, session.workspaceId);
  if (!brand) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const snapshot = await getLatestReviewSnapshot(id);
  const review = (snapshot?.recentReviews as PlaceReview[] | undefined)?.[parsed.data.reviewIndex];
  if (!review) return NextResponse.json({ error: "Review not found" }, { status: 404 });

  const reply = await draftReviewReply(review, brand.name);
  return NextResponse.json({ reply });
}
