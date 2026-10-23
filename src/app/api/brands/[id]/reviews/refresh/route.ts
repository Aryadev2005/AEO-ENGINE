import { NextRequest, NextResponse } from "next/server";
import { getBrand } from "@/lib/brands";
import { refreshReviewSnapshot } from "@/lib/reviews";
import { requireSessionOrResponse } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireSessionOrResponse();
  if (response) return response;

  const { id } = await params;
  const brand = await getBrand(id, session.workspaceId);
  if (!brand) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!brand.googlePlaceId) {
    return NextResponse.json({ error: "No Google Place connected yet" }, { status: 400 });
  }

  try {
    const details = await refreshReviewSnapshot(id, brand.googlePlaceId);
    return NextResponse.json({ details });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
