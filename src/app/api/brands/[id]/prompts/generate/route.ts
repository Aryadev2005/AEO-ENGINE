import { NextRequest, NextResponse } from "next/server";
import { generatePrompts, getBrand, listCompetitors } from "@/lib/brands";
import { requireSessionOrResponse } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireSessionOrResponse();
  if (response) return response;

  const { id } = await params;
  const brand = await getBrand(id, session.workspaceId);
  if (!brand) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const competitors = await listCompetitors(id);
  const prompts = await generatePrompts({
    brandName: brand.name,
    category: brand.category ?? "business",
    city: brand.city ?? undefined,
    country: brand.country ?? undefined,
    competitorNames: competitors.map((c) => c.name),
  });

  return NextResponse.json({ prompts });
}
