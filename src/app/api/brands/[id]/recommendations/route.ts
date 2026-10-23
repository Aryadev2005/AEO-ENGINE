import { NextRequest, NextResponse } from "next/server";
import { getBrand } from "@/lib/brands";
import { listRecommendations } from "@/lib/recommendations";
import { requireSessionOrResponse } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireSessionOrResponse();
  if (response) return response;

  const { id } = await params;
  const brand = await getBrand(id, session.workspaceId);
  if (!brand) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const recommendations = await listRecommendations(id);
  return NextResponse.json({ recommendations });
}
