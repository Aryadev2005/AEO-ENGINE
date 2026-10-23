import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getBrand } from "@/lib/brands";
import { connectPlace, refreshReviewSnapshot } from "@/lib/reviews";
import { requireSessionOrResponse } from "@/lib/session";

export const dynamic = "force-dynamic";

const BodySchema = z.object({ placeId: z.string().min(1) });

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

  await connectPlace(id, parsed.data.placeId);
  try {
    await refreshReviewSnapshot(id, parsed.data.placeId);
  } catch (err) {
    // still connected even if the first refresh fails — surface the error but don't fail the connect
    return NextResponse.json({ ok: true, refreshError: String(err) });
  }
  return NextResponse.json({ ok: true });
}
