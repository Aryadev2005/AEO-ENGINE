import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updateRecommendationStatus } from "@/lib/recommendations";
import { requireSessionOrResponse } from "@/lib/session";

export const dynamic = "force-dynamic";

const PatchSchema = z.object({ status: z.enum(["open", "done", "dismissed"]) });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireSessionOrResponse();
  if (response) return response;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const ok = await updateRecommendationStatus(id, session.workspaceId, parsed.data.status);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
