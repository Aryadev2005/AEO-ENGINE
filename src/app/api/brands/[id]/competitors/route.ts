import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { addCompetitor, getBrand, listCompetitors } from "@/lib/brands";
import { requireSessionOrResponse } from "@/lib/session";

export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  name: z.string().min(1).max(200),
  aliases: z.array(z.string()).optional(),
  website: z.string().url().optional(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireSessionOrResponse();
  if (response) return response;

  const { id } = await params;
  const brand = await getBrand(id, session.workspaceId);
  if (!brand) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const competitors = await listCompetitors(id);
  return NextResponse.json({ competitors });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireSessionOrResponse();
  if (response) return response;

  const { id } = await params;
  const brand = await getBrand(id, session.workspaceId);
  if (!brand) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const competitorId = await addCompetitor(id, parsed.data);
  return NextResponse.json({ id: competitorId }, { status: 201 });
}
