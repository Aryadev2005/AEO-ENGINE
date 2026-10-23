import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { addPrompt, getBrand, listPrompts } from "@/lib/brands";
import { requireSessionOrResponse } from "@/lib/session";

export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  text: z.string().min(1).max(500),
  intent: z.enum(["discovery", "comparison", "alternative", "review", "local"]).optional(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireSessionOrResponse();
  if (response) return response;

  const { id } = await params;
  const brand = await getBrand(id, session.workspaceId);
  if (!brand) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const prompts = await listPrompts(id);
  return NextResponse.json({ prompts });
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

  const promptId = await addPrompt(id, { ...parsed.data, source: "manual" });
  return NextResponse.json({ id: promptId }, { status: 201 });
}
