import { NextRequest, NextResponse } from "next/server";
import { getBrand, getLatestScores, getScoreHistory } from "@/lib/brands";
import { requireSessionOrResponse } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireSessionOrResponse();
  if (response) return response;

  const { id } = await params;
  const brand = await getBrand(id, session.workspaceId);
  if (!brand) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const latest = await getLatestScores(id);
  const history = await getScoreHistory(id);
  return NextResponse.json({ ...latest, history });
}
