import { NextRequest, NextResponse } from "next/server";
import { getBrand, listCompetitors, suggestCompetitors } from "@/lib/brands";
import { requireSessionOrResponse } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireSessionOrResponse();
  if (response) return response;

  const { id } = await params;
  const brand = await getBrand(id, session.workspaceId);
  if (!brand) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const existing = await listCompetitors(id);
  const suggestions = await suggestCompetitors({
    brandName: brand.name,
    category: brand.category ?? undefined,
    city: brand.city ?? undefined,
    known: existing.map((c) => c.name),
  });

  return NextResponse.json({ suggestions });
}
