import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { deleteBrand, getBrand, updateBrand } from "@/lib/brands";
import { requireSessionOrResponse } from "@/lib/session";

export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  aliases: z.array(z.string()).optional(),
  website: z.string().url().optional(),
  category: z.string().max(200).optional(),
  city: z.string().max(200).optional(),
  country: z.string().max(100).optional(),
  description: z.string().max(2000).optional(),
  schedule: z.enum(["off", "weekly", "daily"]).optional(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireSessionOrResponse();
  if (response) return response;

  const { id } = await params;
  const brand = await getBrand(id, session.workspaceId);
  if (!brand) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ brand });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireSessionOrResponse();
  if (response) return response;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const brand = await updateBrand(id, session.workspaceId, parsed.data);
  if (!brand) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ brand });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireSessionOrResponse();
  if (response) return response;

  const { id } = await params;
  const ok = await deleteBrand(id, session.workspaceId);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
