import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { removePrompt, updatePrompt } from "@/lib/brands";
import { requireSessionOrResponse } from "@/lib/session";

export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  text: z.string().min(1).max(500).optional(),
  intent: z.enum(["discovery", "comparison", "alternative", "review", "local"]).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireSessionOrResponse();
  if (response) return response;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const ok = await updatePrompt(id, session.workspaceId, parsed.data);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireSessionOrResponse();
  if (response) return response;

  const { id } = await params;
  const ok = await removePrompt(id, session.workspaceId);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
