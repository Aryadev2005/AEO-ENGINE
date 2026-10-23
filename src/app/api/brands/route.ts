import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createBrand, listBrands } from "@/lib/brands";
import { requireSessionOrResponse } from "@/lib/session";

export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  name: z.string().min(1).max(200),
  aliases: z.array(z.string()).optional(),
  website: z.string().url().optional(),
  category: z.string().max(200).optional(),
  city: z.string().max(200).optional(),
  country: z.string().max(100).optional(),
  description: z.string().max(2000).optional(),
});

export async function GET() {
  const { session, response } = await requireSessionOrResponse();
  if (response) return response;

  const brands = await listBrands(session.workspaceId);
  return NextResponse.json({ brands });
}

export async function POST(req: NextRequest) {
  const { session, response } = await requireSessionOrResponse();
  if (response) return response;

  const body = await req.json().catch(() => ({}));
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const brand = await createBrand(session.workspaceId, parsed.data);
  return NextResponse.json({ brand }, { status: 201 });
}
