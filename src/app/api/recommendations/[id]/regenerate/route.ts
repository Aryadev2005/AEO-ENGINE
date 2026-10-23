import { NextRequest, NextResponse } from "next/server";
import { regenerateRecommendation } from "@/lib/recommendations";
import { requireSessionOrResponse } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireSessionOrResponse();
  if (response) return response;

  const { id } = await params;
  const ok = await regenerateRecommendation(id, session.workspaceId);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
